// ─────────────────────────────────────────────────────────────
// PDF 도구 전용: 글자 추출, 글 보기, 복사·저장
// ─────────────────────────────────────────────────────────────
var TOOL = {name:'PDF', key:'pdf'};

var SAMPLE_TEXT = `[세무조정 계산서 — 2024년 제3기 부가가치세]

의뢰인 정보
────────────────────────────────────
법인명:         (주)가나다산업
사업자등록번호: 123-45-67890
대표자:         홍길동
주소:           서울시 강남구 테헤란로 123길 45
연락처:         02-1234-5678
이메일:         hong@ganada.co.kr

매출 내역 (과세)
────────────────────────────────────
1분기    35,000,000원
2분기    42,500,000원
3분기    38,700,000원
소계    116,200,000원

매입처
────────────────────────────────────
(주)마바사물산   사업자번호: 234-56-78901
아자차인쇄소     사업자번호: 345-67-89012
소계     89,300,000원

납부세액: 2,690,000원
담당 세무사: 김세무 (010-9876-5432)
`;

var rawText = '';
var masked$ = '';
var curTab  = 'mask';
var inDoc   = false;

function hasDoc() { return inDoc; }

var DROP_HTML = '<div class="drop-title">PDF 파일을 드래그하거나 클릭하여 업로드</div><div class="drop-sub">글자가 들어 있는 PDF만 됩니다 · 스캔(이미지) PDF 불가</div>';
function setDC(html){ $('drop-content').innerHTML = html; }

// ─── 파일 받기 ───
function handleDrop(e) {
  e.preventDefault(); e.stopPropagation();
  $('drop-zone').classList.remove('drag');
  var f = e.dataTransfer.files[0]; if (f) pickFile(f);
}
function handleFile(e) {
  var f = e.target.files[0];
  e.target.value = ''; // 같은 파일을 다시 골라도 change가 뜨게 비운다
  if (f) pickFile(f);
}
function pickFile(f) {
  if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) extractPDF(f);
  else showErr('PDF 파일만 열 수 있습니다.');
}
function handleDirectInput() {
  var v = $('direct-input').value;
  if (!v.trim()) { showErr('가릴 글을 붙여넣어 주세요.'); return; }
  setRawText(v);
}
function loadSample() { setRawText(SAMPLE_TEXT); }
var _job = 0;   // 가장 나중에 시작한 작업 번호. 오래 걸린 PDF 읽기가 늦게 끝나 새 화면을 덮지 않게 한다

// pdf.js 워커와 글자표(CMap)는 이 파일 안에 담겨 있다. 외부에서 받지 않는다.
var _pdfReady = null, _cmaps = null, _cmapMissing = false;
// 이 브라우저·이 주소에서 blob 워커를 쓸 수 있는지 먼저 작은 워커로 확인한다
function blobWorkerWorks() {
  return new Promise(function(res){
    var w = null, done = false;
    var url = URL.createObjectURL(new Blob(['postMessage(1)'], {type:'text/javascript'}));
    var fin = function(ok){ if (done) return; done = true; try { if (w) w.terminate(); } catch(e){} URL.revokeObjectURL(url); res(ok); };
    try { w = new Worker(url); w.onmessage = function(){ fin(true); }; w.onerror = function(){ fin(false); }; }
    catch(e) { fin(false); }
    setTimeout(function(){ fin(false); }, 2000);
  });
}
function initPDFJS() {
  if (!_pdfReady) _pdfReady = (async function(){
    var src = $('pdfjs-worker').textContent;
    var url = URL.createObjectURL(new Blob([src], {type:'text/javascript'}));
    var opt = window.pdfjsLib.GlobalWorkerOptions;
    // 워커를 직접 만들어 넘긴다 (내려받아 연 파일에서도 별도 워커로 돈다).
    // 워커를 못 쓰는 환경이면 pdf.js가 같은 코드를 이 페이지 안에서 대신 돌린다.
    if (await blobWorkerWorks()) opt.workerPort = new Worker(url);
    else opt.workerSrc = url;
    _cmaps = JSON.parse($('pdfjs-cmaps').textContent);
  })();
  return _pdfReady;
}
// 글꼴을 담지 않은 옛 한글 PDF는 글자표가 있어야 글자를 읽는다. 한국어 글자표만 담았다.
class BundledCMapReader {
  async fetch({name}) {
    var b64 = _cmaps[name];
    if (!b64) { _cmapMissing = true; throw new Error('담지 않은 글자표: ' + name); }
    return { cMapData: Uint8Array.from(atob(b64), function(ch){ return ch.charCodeAt(0); }),
             compressionType: window.pdfjsLib.CMapCompressionType.BINARY };
  }
}
// 한 쪽의 글자 조각을 이어 붙인다.
// pdf.js는 띄어쓰기를 ' ' 조각으로, 줄 끝을 hasEOL로 알려 주므로 조각 사이에 공백을 무조건 넣지 않는다
// (넣으면 "가 나 다", "123 - 45 - 67890"처럼 쪼개져 단어·패턴이 안 잡힌다).
// 다만 pdf.js가 알려 주지 않는 경계(따로 찍은 머리글·바닥글·도장, 왼쪽으로 되돌아가 그린 칸)는
// 조각 좌표로 직접 본다: 줄이 바뀌었으면 줄바꿈, 같은 줄에서 틈이 있거나 뒤로 갔으면 한 칸.
function pageText(items) {
  var out = '', prev = null;
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (typeof it.str !== 'string') continue;
    if (prev && it.str && !/\s$/.test(out) && !/^\s/.test(it.str)) {
      var a = prev.transform, b = it.transform;
      if (a && b && !a[1] && !a[2] && !b[1] && !b[2]) {          // 회전하지 않은 글자만 좌표로 판단
        var h = Math.abs(prev.height) || Math.abs(a[3]) || 1;
        if (Math.abs(b[5] - a[5]) > 0.5 * h) out += '\n';
        else if (b[4] - (a[4] + (prev.width || 0)) > 0.1 * h || b[4] < a[4]) out += ' ';
      }
    }
    out += it.str;
    if (it.hasEOL) { out += '\n'; prev = null; }
    else if (it.str) prev = it;
  }
  return out;
}
async function extractPDF(file) {
  hideErr();
  setDC('<div class="drop-title">PDF에서 글자를 읽는 중…</div>');
  var task = null, job = ++_job;
  _cmapMissing = false;
  try {
    await initPDFJS();
    var ab = await file.arrayBuffer();
    // isEvalSupported:false = CVE-2024-4367 공식 우회책(악성 PDF의 임의 JS 실행 차단). 지우지 말 것 — build.mjs가 검사한다
    task = window.pdfjsLib.getDocument({data: ab, isEvalSupported: false,
      CMapReaderFactory: BundledCMapReader, cMapPacked: true, useWorkerFetch: false});
    var pdf = await task.promise;
    var text = '', empty = 0;
    for (var i = 1; i <= pdf.numPages; i++) {
      var c = await (await pdf.getPage(i)).getTextContent();
      var t = pageText(c.items);
      if (!t.trim()) empty++;
      text += t + (/\n$/.test(t) ? '' : '\n');
    }
    if (job !== _job) return;
    setDC(DROP_HTML);
    if (!text.trim()) return showErr(_cmapMissing
      ? '이 PDF는 한국어가 아닌 글자표를 쓰고 글꼴이 들어 있지 않아 글자를 읽을 수 없습니다.'
      : '글자를 읽을 수 없습니다. 스캔(이미지) PDF는 지원하지 않습니다.');
    setRawText(text);
    if (empty) toast('전체 '+pdf.numPages+'쪽 중 '+empty+'쪽은 글자가 없어 빠졌습니다(스캔된 쪽일 수 있습니다).');
    else if (_cmapMissing) toast('일부 글자는 글자표가 없어 빠졌습니다(한국어가 아닌 글꼴).');
  } catch(err) {
    if (job !== _job) return;
    setDC(DROP_HTML);
    showErr(err && err.name === 'PasswordException'
      ? '비밀번호가 설정된 PDF입니다. 비밀번호를 해제한 후 다시 올려 주세요.'
      : 'PDF를 읽는 중 오류가 났습니다. 다시 올려도 같으면 페이지를 새로 고친 뒤 시도해 주세요.');
  } finally {
    if (task) task.destroy(); // 원본 PDF를 쥐고 있는 워커 메모리를 놓는다
  }
}
function setRawText(text) {
  hideErr();
  _job++;
  rawText = text; inDoc = true;
  $('raw-ta').value = text;
  $('upload-area').style.display = 'none';
  $('result-area').style.display = 'block';
  $('status-bar').classList.add('show');
  setTabUI('mask');   // 올리면 가린 결과부터 보여 준다
  refresh();
}

function doReset() {
  _job++;
  rawText = ''; masked$ = ''; inDoc = false;
  $('direct-input').value = '';
  $('raw-ta').value = '';          // 화면에서 숨긴 원문·결과도 지운다
  $('tv-mask').innerHTML = '';
  setDC(DROP_HTML);
  resetCommon();
}

// ─── 가리기 ───
function refresh() {
  var map = {};
  masked$ = maskText(rawText, compileWords(), auditAdder(map), newSeq());
  auditList = auditFromMap(map);
  residueList = findResidue(masked$, 9).map(function(x){ return {value:x, where:''}; });
  if (curTab === 'mask') renderMaskedView();
  renderSummary();
}
function onRawEdit(v) { rawText = v; refresh(); }

function renderMaskedView() {
  // 실제로 넣은 치환 코드만 강조한다 (원문에 원래 있던 대괄호 글자는 강조하지 않는다)
  var inserted = {};
  auditList.forEach(function(x){ inserted[x.token] = true; });
  $('tv-mask').innerHTML = masked$.split(/(\[[^\]\n]+\])/g).map(function(p){
    return inserted[p] ? '<span class="code-chip">'+esc(p)+'</span>' : esc(p);
  }).join('');
}

function switchTab(tab) {
  setTabUI(tab);
  if (tab === 'mask') renderMaskedView();
}
function setTabUI(tab) {
  curTab = tab;
  $('tab-orig').classList.toggle('active', tab === 'orig');
  $('tab-mask').classList.toggle('active', tab === 'mask');
  $('tv-orig').style.display = tab === 'orig' ? 'block' : 'none';
  $('tv-mask').style.display = tab === 'mask' ? 'block' : 'none';
  $('pdf-actions').style.display = tab === 'mask' ? 'flex' : 'none';
}

// ─── 복사·저장 ───
async function copyMasked() {
  var success = false;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try { await navigator.clipboard.writeText(masked$); success = true; } catch(e) {}
  }
  if (!success) {
    var ta = document.createElement('textarea');
    ta.value = masked$; ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0;';
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, masked$.length);
    try { success = document.execCommand('copy'); } catch(e) {}
    document.body.removeChild(ta);
  }
  toast(success ? '가린 글을 복사했습니다' : '복사하지 못했습니다. TXT 저장을 이용해 주세요.');
}
function dlTxt() { dlBlob(masked$, 'masked_' + dateStamp() + '.txt', 'text/plain;charset=utf-8'); toast('가린 글을 저장했습니다.'); }

initCommon();
