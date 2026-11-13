// ─────────────────────────────────────────────────────────────
// PDF 도구 전용: 글자 추출, 표 모양으로 보기, 글 보기, 복사·저장
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

var rawText = '';      // 지금 화면에 쓰는 원문 (표 모양을 켰으면 마크다운 표가 든 글)
var masked$ = '';
var curTab  = 'mask';
var inDoc   = false;
// 표 모양으로 보기: PDF에서 표를 찾았을 때만 쓸 수 있다. 원문은 방식마다 따로 둔다(고친 내용도 방식마다 따로).
var src  = {plain:'', table:null, n:0, pp:[], tp:[]};   // 읽어 온 그대로(pp·tp는 쪽별). table이 null이면 표를 못 찾은 문서(또는 붙여넣은 글)
var edit = {plain:'', table:''};          // 사용자가 고친 글
var tableMode = false;                    // 사용자가 켠 상태. 다음 파일에도 이어진다
function tableOn() { return tableMode && src.table !== null; }

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

// ─── 표 모양으로 보기 ───
// 글자 조각의 좌표로 표를 찾아 마크다운 표(| 칸 | 칸 |)로 바꾼다. 표가 아닌 곳은 pageText 결과 그대로다.
// PDF에는 "여기가 표"라는 표시가 없어 줄·칸을 좌표로 짐작한다. 틀릴 수 있으므로 기본은 꺼 두고, 켜면 화면에 표로 그려 보여 준다.
//   1) y가 같은 조각을 한 줄로 묶고, 틈이 벌어진 곳에서 덩어리(칸 후보)로 나눈다.
//   2) 덩어리가 둘 이상인 줄이 이어지면 표 후보다. 한 덩어리뿐인 줄은 윗줄의 한 칸 안에 들어갈 때만 끼워 준다(칸 안 줄바꿈).
//   3) 줄을 행으로 묶는다(칸 안에서 줄이 바뀐 글, 세로 가운데 맞춘 칸).
//   4) 열 짜임이 서로 다른 표가 붙어 있으면 그 사이에서 나눈다.
//   5) 여러 행에서 글자가 겹쳐 놓인 x 구간을 열로 본다. 세 열 이상, 두 행 이상일 때만 표로 친다.
//      (3~5는 줄이 아니라 "행"을 놓고 한다. 줄 간격이 두 무리(좁은 것=칸 안 줄바꿈, 넓은 것=행 사이)로 갈리면
//       좁은 간격의 줄들을 먼저 한 행으로 묶는다. 한 칸에 여러 줄이 든 자리는 <br>로 잇는다.)
var BR = '<br>';
// 표 줄이면 칸 목록, 아니면 null. 사람이 고친 글도 받도록 앞뒤 공백과 칸 구분 옆 공백에 너그럽다. \| 는 칸 안의 | 글자다
function mdCells(l) {
  l = l.trim();
  if (l.length < 2 || l.charAt(0) !== '|' || l.slice(-1) !== '|' || l.slice(-2) === '\\|') return null;
  return l.slice(1, -1).replace(/\\\|/g, '\u0000').split('|').map(function(c){ return c.trim().replace(/\u0000/g, '\\|'); });
}
function mdRow(l) { return mdCells(l) !== null; }
function isAmt(t) { return /^[+\-(△▲]?[\d,]*\d(?:\.\d+)?\)?%?$/.test(t); }   // 금액·수량 모양 (끝에 하이픈이 남은 번호 토막, 날짜·시각은 아니다)
// 칸이 갈리는 자리로 볼 띄어쓰기인가: 두 금액 사이("3,420,000 200,000"), 또는 글자로 된 낱말 뒤에 쉼표로 끊은 금액이 올 때("복리후생비 2,310,000").
// 칸 사이가 좁으면 pdf.js가 이웃 칸을 한 조각으로 주기 때문이다. "₩ 173,704,772"처럼 기호 뒤의 금액은 가르지 않는다.
// 한 칸 안의 "이자 18,204" 같은 글도 여기서 갈리지만, 같은 열에 놓이므로 열을 정할 때 다시 한 칸으로 붙는다.
function amtGap(a, b) {
  var p = a.slice(a.lastIndexOf(' ') + 1), w = b.split(' ')[0];
  return isAmt(w) && (isAmt(p) || (/,\d{3}/.test(w) && /[가-힣A-Za-z]/.test(p)));
}
function quant(a, q) { a = a.slice().sort(function(x, y){ return x - y; }); return a.length ? a[Math.min(a.length - 1, Math.floor(a.length * q))] : 0; }
function matMul(m, n) { return [m[0]*n[0]+m[2]*n[1], m[1]*n[0]+m[3]*n[1], m[0]*n[2]+m[2]*n[3], m[1]*n[2]+m[3]*n[3], m[0]*n[4]+m[2]*n[5]+m[4], m[1]*n[4]+m[3]*n[5]+m[5]]; }
function xHits(c, row) { var n = 0; row.ch.forEach(function(q){ if (q.x0 < c.x1 && c.x0 < q.x1) n++; }); return n; }
function isMulti(r) { return r.ch.length >= 2; }

// 열 후보: 여러 줄의 덩어리가 겹쳐 놓인 x 구간. 줄이 넉넉하면 한두 줄만 걸친 곳(칸을 넘친 긴 글, 합친 칸의 "합계")은 열 사이 틈으로 본다
function tblCores(rows, strict) {
  var thr = strict ? 0 : Math.max(rows.length >= 4 ? 1 : 0, Math.floor(rows.length * 0.1));
  var ev = [], cores = [], cnt = 0, s0 = 0;
  rows.forEach(function(r){ r.ch.forEach(function(c){ ev.push([c.x0, 1]); ev.push([c.x1, -1]); }); });
  ev.sort(function(a, b){ return a[0] - b[0] || a[1] - b[1]; });
  ev.forEach(function(e){
    var was = cnt > thr; cnt += e[1];
    if (!was && cnt > thr) s0 = e[0];
    if (was && cnt <= thr && e[0] > s0) cores.push([s0, e[0]]);
  });
  return cores;
}
// 열: 겹침 구간에, 어느 구간에도 걸치지 않은 덩어리(몇 줄에만 값이 있는 열)를 더하고,
// 같은 줄에 함께 나온 적이 없는 이웃 구간은 한 열로 합친다(가운데 맞춘 머리글과 오른쪽 맞춘 숫자처럼 자리만 다른 같은 열).
// 다만 두 구간에 모두 금액이 들어 있으면 합치지 않는다: 차변·대변, 출금·입금처럼 한 행에 한쪽만 채워지는 열은
// 머리글이 없는 쪽(이어지는 쪽)에서는 함께 나오는 행이 하나도 없다. 합치면 차변과 대변이 한 열이 되어 조용히 틀린다.
function tblCols(rows) {
  var cols = tblCores(rows.filter(isMulti)), lone = [], o = null;
  function hit(c, a) { return a[0] < c.x1 && c.x0 < a[1]; }
  rows.forEach(function(r){ r.ch.forEach(function(c){ if (!cols.some(function(a){ return hit(c, a); })) lone.push(c); }); });
  lone.sort(function(a, b){ return a.x0 - b.x0; });
  lone.forEach(function(c){ if (o && c.x0 < o[1]) o[1] = Math.max(o[1], c.x1); else { o = [c.x0, c.x1]; cols.push(o); } });
  cols.sort(function(a, b){ return a[0] - b[0]; });
  function together(a, b) {
    return rows.some(function(r){ return r.ch.some(function(c){ return hit(c, a) && !hit(c, b); }) && r.ch.some(function(c){ return hit(c, b) && !hit(c, a); }); });
  }
  function money(a) {
    if (a.amt === undefined) a.amt = rows.some(function(r){ return r.ch.some(function(c){ return hit(c, a) && c.s.split(BR).some(isAmt); }); });
    return a.amt;
  }
  for (var j = 0; j + 1 < cols.length; ) {
    if (together(cols[j], cols[j+1]) || (money(cols[j]) && money(cols[j+1]))) j++;
    else cols.splice(j, 2, [cols[j][0], Math.max(cols[j][1], cols[j+1][1])]);
  }
  return cols;
}
// 열 짜임이 다른지 보는 잣대: P의 한 열 안에 덩어리가 둘 이상 들어가는 Q의 행 수.
// (몇 행만 놓고 보는 자리라 이웃 구간을 합치지 않은 tblCores로 본다)
function viol(P, Q, strict) {
  var cols = tblCores(P, strict), bad = 0;
  Q.forEach(function(r){
    if (cols.some(function(a){ var n = 0; r.ch.forEach(function(c){ if (Math.min(a[1], c.x1) - Math.max(a[0], c.x0) > 1) n++; }); return n >= 2; })) bad++;
  });
  return bad;
}
// 열 짜임이 다른 표가 붙어 있으면 나눈다. 위에서부터 차례로 본다(위쪽은 이미 한 가지 짜임만 남아 있다).
//   아래 여섯 행과 견주어 그런 행이 셋 중 하나 이상이면 근처에 경계가 있다.
//   그 뒤 여섯 자리 가운데, 잘랐을 때 위쪽과 아래쪽이 저마다 한 가지 짜임으로 남는 자리(같으면 줄 간격이 더 벌어진 자리)에서 자른다.
//   "한 가지 짜임"은 한 줄도 봐주지 않고 잰다(봐주면 표 위에 붙은 안내 줄 하나가 섞인 것을 놓친다).
function splitRows(rows) {
  var mi = [], out = [], s = 0, start = 0;
  rows.forEach(function(r, k){ if (isMulti(r)) mi.push(k); });
  function win(a, b) { return mi.slice(a, b).map(function(k){ return rows[k]; }); }
  for (var j = 1; j < mi.length; j++) {
    var U = win(Math.max(s, j - 6), j), L = win(j, j + 6), a = viol(U, L), b = viol(L, U);
    if (!((a > 0 && a >= L.length / 3) || (b > 0 && b >= U.length / 3))) continue;
    var best = j, low = 1e9, gap = 0;
    for (var q = j; q < Math.min(j + 6, mi.length); q++) {
      var Uq = win(Math.max(s, q - 6), q), Lq = win(q, q + 6);
      var mix = viol(Uq, Uq, true) + viol(Lq, Lq, true), g = rows[mi[q]].y - rows[mi[q]-1].y;
      if (mix < low || (mix === low && g > gap + 0.01)) { low = mix; best = q; gap = g; }
    }
    var cut = mi[best];
    while (cut > start + 1 && !isMulti(rows[cut-1]) && rows[cut].y - rows[cut-1].y < 0.9 * rows[cut].h) cut--;   // 반 줄 위에 뜬 줄은 아래 표의 것
    out.push(rows.slice(start, cut));
    start = cut; s = best; j = best;
  }
  out.push(rows.slice(start));
  return out;
}
// 줄을 행으로 묶는다. cut보다 좁은 간격으로 이어진 줄은 한 행이고, 그 안에서 x가 겹치는 덩어리는 한 칸의 여러 줄이다.
// 서로 다른 행을 잘못 묶은 흔적이 하나라도 있으면 그 간격은 행 사이 간격이다. null을 돌려주어 더 좁은 간격으로 다시 해 보게 한다:
//   한 칸에 금액이 두 번 들어간다 / 금액이 든 줄이 둘 이상이다(한 줄짜리 칸은 한 행에서 같은 높이에 놓인다. 윗줄 차변·아랫줄 대변인 전표가 그렇다)
//   / 칸이 거의 다 찬 줄이 둘 이상이다 / 줄이 열둘을 넘는다.
function bandRows(rows, cut) {
  var most = 0, groups = [], G = null, out = [], bad = false;
  rows.forEach(function(r){ most = Math.max(most, r.ch.length); });
  rows.forEach(function(r, k){
    if (!G || r.y - rows[k-1].y > cut) { G = []; groups.push(G); }
    G.push(r);
  });
  function band(vr) {
    var B = {y:vr[0].y, h:vr[0].h, vr:vr, ch:[], ok:true}, full = 0, amt = 0;
    vr.forEach(function(r){
      if (r.ch.length >= Math.max(2, 0.8 * most)) full++;
      var fresh = false;   // 이 줄에서 새 칸으로 시작한 금액이 있는가 (윗줄 번호에 이어진 토막 "124-81-⏎00998"은 세지 않는다)
      r.ch.forEach(function(c){
        var t = null;
        B.ch.forEach(function(q){ if (!t && q.x0 < c.x1 && c.x0 < q.x1) t = q; });
        if (!t) { if (isAmt(c.s)) fresh = true; B.ch.push({x0:c.x0, x1:c.x1, lines:[c.s], at:r}); return; }
        if (t.at === r) t.lines[t.lines.length-1] += ' ' + c.s;
        else { if (isAmt(c.s) && t.lines.some(isAmt)) B.ok = false; t.lines.push(c.s); t.at = r; }
        t.x0 = Math.min(t.x0, c.x0); t.x1 = Math.max(t.x1, c.x1);
      });
      if (fresh) amt++;
    });
    if (vr.length > 1 && (full >= 2 || amt >= 2 || vr.length > 12)) B.ok = false;
    B.ch.sort(function(a, b){ return a.x0 - b.x0; });
    B.ch.forEach(function(c){ c.s = c.lines.join(BR); });
    return B;
  }
  groups.forEach(function(vr){
    var B = band(vr);
    if (!B.ok) bad = true;
    out.push(B);
  });
  return bad ? null : out;
}
// 행 묶음에서 열을 정하고 표를 만든다. 표가 아니면 null
function buildTable(rows) {
  var multi = rows.filter(isMulti);
  if (multi.length < 2) return null;
  var cols = tblCols(rows);
  if (cols.length < 3) return null;
  function colOf(c) { for (var j = 0; j < cols.length; j++) if (cols[j][0] < c.x1 && c.x0 < cols[j][1]) return j; return 0; }
  rows.forEach(function(r){
    r.cells = cols.map(function(){ return ''; });
    r.ch.forEach(function(c){ var j = colOf(c); r.cells[j] = r.cells[j] ? r.cells[j] + ' ' + c.s : c.s; });   // 여러 열에 걸친 덩어리는 왼쪽 열에 둔다
    r.nf = r.cells.filter(function(v){ return v; }).length;
  });
  var good = multi.filter(function(r){ return r.nf >= 2; }).length;
  if (good < 2 || good < multi.length * 0.5) return null;
  // 표 앞뒤에 붙은 한 덩어리짜리 행(제목·주석)은 표에서 뺀다
  var out = rows.slice();
  while (out.length && !isMulti(out[out.length-1])) out.pop();
  while (out.length && !isMulti(out[0])) out.shift();
  if (out.length < 2) return null;
  var md = out.map(function(r){ return '| ' + r.cells.map(function(v){ return v.replace(/\|/g, '\\|'); }).join(' | ') + ' |'; });
  // 마크다운 표는 첫 행이 머리글이다. 첫 행에 금액이 있으면 머리글이 없는 표(이어지는 쪽 등)이므로 빈 머리글 행을 둔다
  var head = out[0].cells.some(function(v){ return v.split(BR).some(isAmt); }) ? 0 : 1;
  if (!head) md.unshift('| ' + cols.map(function(){ return ''; }).join(' | ') + ' |');
  md.splice(1, 0, '| ' + cols.map(function(){ return '---'; }).join(' | ') + ' |');
  var its = [];
  out.forEach(function(r){ r.vr.forEach(function(v){ v.its.forEach(function(it){ its.push(it.i); }); }); });
  return {md:md.join('\n'), its:its};
}
// 표 후보(줄 묶음) 하나에서 표를 뽑는다: 줄을 행으로 묶고 → 열 짜임이 바뀌는 곳에서 나누고 → 조각마다 표를 만든다
function blockTables(rows) {
  // 행 묶기: 줄 간격을 작은 것부터 늘어놓아 크게 뛰는 자리(1.25배 이상)를 찾는다. 칸 안 줄 간격은 글자 높이의 두 배를 넘지 않는다.
  var h = quant(rows.map(function(r){ return r.h; }), 0.5), gaps = [], bands = null, k;
  for (k = 1; k < rows.length; k++) gaps.push(rows[k].y - rows[k-1].y);
  gaps.sort(function(a, b){ return a - b; });
  for (k = gaps.length - 1; k >= 1 && !bands; k--) {
    if (gaps[k] >= 1.25 * gaps[k-1] && gaps[k-1] <= 1.9 * h) bands = bandRows(rows, gaps[k-1] + 0.01);
  }
  if (!bands) bands = bandRows(rows, -1);
  // 표 바로 위의 제목 줄("거래처 원장 … 2026-10-31 현재"처럼 두 덩어리 이하이고 금액이 없는 줄)은 표에서 뺀다.
  // 표의 첫 행으로 들어가면 머리글이 밀리고, 자리가 열과 어긋나면 표가 중간에서 갈린다.
  var most = 0;
  bands.forEach(function(r){ most = Math.max(most, r.ch.length); });
  while (most >= 4 && bands.length > 2 && bands[0].ch.length <= 2 && !bands[0].ch.some(function(c){ return c.s.split(BR).some(isAmt); })) bands.shift();
  var out = [];
  splitRows(bands).forEach(function(part){ var t = buildTable(part); if (t) out.push(t); });
  return out;
}

// 한 쪽을 마크다운으로: {text, n(표 개수)}. vt는 쪽의 보기 변환(돌려 놓은 쪽도 바로 선 좌표로 본다)
function pageMd(items, vt) {
  vt = vt || [1, 0, 0, -1, 0, 0];
  var its = [], i;
  for (i = 0; i < items.length; i++) {
    var it = items[i];
    if (typeof it.str !== 'string' || !it.str.trim() || !it.transform) continue;
    var t = matMul(vt, it.transform);
    if (!(t[0] > 0) || Math.abs(t[1]) > 1e-3 * t[0] || Math.abs(t[2]) > 1e-3 * t[0]) continue;   // 바로 선 글자만
    var str = it.str.replace(/\s+/g, ' ').trim(), w = it.width || 0, h = Math.abs(it.height) || Math.abs(t[3]) || 1;
    // 좁게 붙은 이웃 칸의 금액을 pdf.js가 한 조각("3,420,000 200,000")으로 줄 때가 있다. 숫자 사이 공백에서 나눈다.
    // 나눈 토막의 자리는 글자 폭을 어림해(한글 1, 그 밖 0.55, 공백 0.3) 조각 너비에 맞춰 잡는다.
    var parts = [];
    str.split(' ').forEach(function(v){ if (parts.length && !amtGap(parts[parts.length-1], v)) parts[parts.length-1] += ' ' + v; else parts.push(v); });
    if (parts.length < 2) { its.push({i:i, s:str, x:t[4], y:t[5], w:w, h:h}); continue; }
    var wt = function(v){ var n = 0; for (var k = 0; k < v.length; k++) n += /[가-힣]/.test(v[k]) ? 1 : v[k] === ' ' ? 0.3 : 0.55; return n; };
    var unit = w / (wt(str) || 1), x = t[4];
    parts.forEach(function(v){ its.push({i:i, s:v, x:x, y:t[5], w:wt(v) * unit, h:h}); x += (wt(v) + 0.3) * unit; });
  }
  its.sort(function(a, b){ return a.y - b.y || a.x - b.x; });
  var rows = [], row = null;
  its.forEach(function(it){
    if (!row || Math.abs(it.y - row.y) > 0.4 * Math.min(it.h, row.h)) { row = {y:it.y, h:it.h, its:[], ch:[]}; rows.push(row); }
    row.its.push(it);
  });
  // 덩어리: 낱말 사이 띄어쓰기까지는 한 덩어리. 띄어쓰기 너비는 이 쪽의 공백 조각 가운데 가장 좁은 것으로 재고(고정폭 글꼴은 넓다), 없으면 글자 높이의 0.45배로 본다.
  //   (pdf.js는 칸 사이 틈도 공백 조각으로 준다. 낱말 사이는 칸 사이보다 좁으므로 가장 좁은 것을 쓴다)
  // 앞 조각과 많이 겹치면(너비를 알 수 없는 글꼴) 따로 둔다. 금액 뒤에 띄우고 또 금액이 오면 다른 칸이다(좁게 붙은 금액 열).
  var H = quant(its.map(function(it){ return it.h; }), 0.5) || 1, sps = [];
  items.forEach(function(it){ if (it.str === ' ' && it.width >= 0.15 * H && it.width <= H) sps.push(it.width); });
  var word = sps.length ? Math.min(Math.max(1.2 * Math.min.apply(null, sps) / H, 0.3), 0.7) : 0.45;
  rows.forEach(function(r){
    r.its.sort(function(a, b){ return a.x - b.x; });
    var c = null;
    r.its.forEach(function(it){
      var gap = c ? it.x - c.x1 : 0;
      if (c && gap <= word * it.h && gap >= -0.3 * it.h && !(gap > 0.1 * it.h && amtGap(c.s, it.s))) { c.s += (gap > 0.1 * it.h ? ' ' : '') + it.s; c.x1 = Math.max(c.x1, it.x + it.w); }
      else { c = {x0:it.x, x1:it.x + it.w, s:it.s}; r.ch.push(c); }
    });
  });
  // 표 후보로 줄을 묶는다. 줄 간격이 갑자기 크게 벌어지면 다른 표로 본다
  var blocks = [], cur = null;
  function add(r, front) {
    r.blk = true;
    if (front) { cur.rows.unshift(r); return; }
    if (cur.rows.length) cur.pitch.push(r.y - cur.rows[cur.rows.length-1].y);
    cur.rows.push(r);
    if (isMulti(r)) cur.ref = r;
  }
  rows.forEach(function(r, k){
    if (cur && cur.pitch.length && r.y - cur.rows[cur.rows.length-1].y > 2.5 * Math.max(quant(cur.pitch.slice(-40), 0.5), 1.2 * r.h)) { blocks.push(cur); cur = null; }
    if (isMulti(r)) {
      if (cur) { add(r); return; }
      cur = {rows:[], pitch:[], ref:r};
      add(r);
      // 바로 위에 반 줄 간격으로 떠 있는 한 덩어리 줄들(세로 가운데 맞춘 표에서 여러 줄짜리 칸의 윗줄)도 함께 넣는다
      for (var j = k - 1; j >= 0; j--) {
        var p = rows[j];
        if (p.blk || isMulti(p) || cur.rows[0].y - p.y >= 0.9 * r.h || xHits(p.ch[0], r) > 1) break;
        add(p, true);
      }
    } else if (cur) {
      if (xHits(r.ch[0], cur.ref) <= 1) add(r); else { blocks.push(cur); cur = null; }
    }
  });
  if (cur) blocks.push(cur);
  var owner = {}, tables = [];
  blocks.forEach(function(b){
    blockTables(b.rows).forEach(function(t){
      t.its.forEach(function(i){ owner[i] = tables.length; });
      tables.push(t.md);
    });
  });
  if (!tables.length) return {text:pageText(items), n:0};
  // 원래 순서대로 내보낸다. 표에 든 조각은 처음 나오는 자리에서 표 전체로 바꾼다
  var out = '', seg = [], done = {};
  function flush() {
    if (seg.some(function(it){ return typeof it.str === 'string' && it.str.trim(); })) out += pageText(seg);
    seg = [];
  }
  for (i = 0; i < items.length; i++) {
    if (!(i in owner)) { seg.push(items[i]); continue; }
    flush();
    if (done[owner[i]]) continue;
    done[owner[i]] = true;
    out += (out && !/\n$/.test(out) ? '\n' : '') + (out ? '\n' : '') + tables[owner[i]] + '\n\n';
  }
  flush();
  return {text:out.replace(/\n{3,}/g, '\n\n'), n:tables.length};
}

// 칸 구분을 걷어 낸 글(flat)을 만든다. 가리기는 이 글에 대고 한다.
//   칸 구분 " | " → 공백, 줄 앞뒤의 | 는 없앰, 칸 안 줄바꿈 <br> → 줄바꿈, \| → |
// 이렇게 해야 칸에 걸쳐 나뉜 번호("010 | 1234 | 5678")나 칸 안에서 줄이 바뀐 상호도 보통 글과 똑같이 잡힌다.
// "표 줄처럼 생겼는가"는 따지지 않고 모든 줄에서 걷어 낸다. 사용자가 원문을 고쳐 줄 끝에 공백이 붙거나 | 하나가 빠져도
// 가리기가 달라지지 않게 하려는 것이다. 걷어 낸 글자는 mdRestore가 그대로 되돌리므로 표가 아닌 줄의 | 도 그대로 남는다.
// marks: 걷어 낸 자리 [{p:flat에서의 자리, lit:원래 글자, keep:가려져도 되살릴 구조인가}]
function mdFlat(md) {
  var lines = md.split('\n'), flat = '', marks = [], heads = [], tails = [];
  var body = lines.map(function(l, k){
    var h = /^\s*\| ?/.exec(l);
    heads[k] = h ? h[0] : '';
    if (h) l = l.slice(h[0].length);
    var t = / ?\|\s*$/.exec(l);
    if (t && t[0].charAt(0) === '|' && l.charAt(t.index - 1) === '\\') t = null;
    tails[k] = t ? t[0] : '';
    return t ? l.slice(0, t.index) : l;
  });
  body.forEach(function(l, k){
    if (k) {
      var lit = tails[k-1] + '\n' + heads[k];
      if (lit !== '\n') marks.push({p:flat.length, lit:lit, keep:true});
      flat += '\n';
    }
    var re = /\\\||<br>| ?\| ?/g, m, last = 0;
    while ((m = re.exec(l)) !== null) {
      flat += l.slice(last, m.index);
      var kind = m[0] === '\\|' ? '|' : m[0] === BR ? '\n' : ' ';
      marks.push({p:flat.length, lit:m[0], keep:kind === ' '});
      flat += kind;
      last = re.lastIndex;
    }
    flat += l.slice(last);
  });
  return {flat:flat, marks:marks, head:heads[0], tail:tails[tails.length-1]};
}
// 가린 flat에 칸 구분을 되돌린다. steps는 maskText가 알려 준 치환 자리.
// 치환에 삼켜진 칸 구분은 치환 코드 바로 뒤에 다시 넣어 열 수가 그대로 남게 한다.
function mdRestore(masked, f, steps) {
  var marks = f.marks.map(function(m){ return {p:m.p, lit:m.lit, keep:m.keep, gone:false}; });
  steps.forEach(function(ed){
    var j = 0, delta = 0;
    marks.forEach(function(m){
      while (j < ed.length && ed[j].e <= m.p) { delta += ed[j].n - (ed[j].e - ed[j].s); j++; }
      var e = ed[j];
      if (e && (m.gone ? e.s < m.p : e.s <= m.p)) { m.p = e.s + delta + e.n; m.gone = true; }
      else m.p += delta;
    });
  });
  var out = f.head, last = 0;
  marks.forEach(function(m){
    if (m.gone && !m.keep) return;
    out += masked.slice(last, m.p) + m.lit;
    last = m.gone ? m.p : m.p + 1;
  });
  return out + masked.slice(last) + f.tail;
}
// 안전장치: 표 모양으로 바꾸면 못 가리게 되는 값이 있는지 본다.
// 읽어 온 그대로의 글에서 가려지는 값은 표 모양에서도 같은 횟수만큼 가려져야 한다. 쪽마다 따로 센다
// (문서 전체로 세면 한 쪽에서 빠진 것이 다른 쪽에서 새로 가려진 것과 상쇄될 수 있다).
// 글 그대로일 때 "저장 전 확인"에 뜨는 긴 숫자도 함께 돌려준다. 표 모양에서 공백으로 갈려 안 보이게 되는 일이 없게 한다.
// 단어·패턴이 바뀌지 않았으면 앞서 센 결과를 다시 쓴다.
// 가려지는 값마다 횟수를 센다. keep을 주면 가린 글을 keep.masked에 담아 준다
function hitCounts(text, wm, keep) {
  var c = {};
  var m = maskText(text, wm, function(type, orig){ var k = type + '|' + orig.replace(/\s/g, '').toLowerCase(); c[k] = (c[k] || 0) + 1; }, newSeq());
  if (keep) keep.masked = m;
  return c;
}
function tableCheck(wm) {
  var key = JSON.stringify([words, patSt]);
  if (src.ck === key) return src.cv;
  var lost = 0, res = [];
  src.pp.forEach(function(p, i){
    var keep = {}, a = hitCounts(p, wm, keep), b = hitCounts(mdFlat(src.tp[i]).flat, wm);
    Object.keys(a).forEach(function(k){ if ((b[k] || 0) < a[k]) lost += a[k] - (b[k] || 0); });
    findResidue(keep.masked, 9).forEach(function(x){ if (res.indexOf(x) < 0) res.push(x); });
  });
  src.ck = key; src.cv = {lost:lost, res:res};
  return src.cv;
}
function tableLoss(wm) { src.ck = null; return tableCheck(wm).lost; }
// 등록 단어에 표 글의 구분 글자(<br>, |)가 섞여 있으면 공백으로 바꿔 맞춘다 (① 원본 화면에서 보이는 대로 복사해 등록한 경우)
function pdfWords() {
  var keep = words;
  words = words.map(function(w){
    var o = String(w.original || '');
    if (/<br>|\|/i.test(o)) o = o.replace(/<br>/gi, ' ').replace(/\\\|/g, '\u0000').replace(/\|/g, ' ').replace(/\u0000/g, '|').replace(/\s+/g, ' ').trim();
    return {original:o, token:w.token, id:w.id};
  });
  var wm = compileWords();
  words = keep;
  return wm;
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
    var text = '', md = '', nt = 0, empty = 0, pp = [], tp = [];
    for (var i = 1; i <= pdf.numPages; i++) {
      var page = await pdf.getPage(i), c = await page.getTextContent();
      var t = pageText(c.items), m = {text:t, n:0};
      if (!t.trim()) empty++;
      text += t + (/\n$/.test(t) ? '' : '\n');
      try { m = pageMd(c.items, page.getViewport({scale:1}).transform); } catch(e) { m = {text:t, n:0}; }   // 표 찾기가 실패한 쪽은 글 그대로 둔다
      md += m.text + (/\n$/.test(m.text) ? '' : '\n'); nt += m.n;
      pp.push(t); tp.push(m.text);
    }
    if (job !== _job) return;
    setDC(DROP_HTML);
    if (!text.trim()) return showErr(_cmapMissing
      ? '이 PDF는 한국어가 아닌 글자표를 쓰고 글꼴이 들어 있지 않아 글자를 읽을 수 없습니다.'
      : '글자를 읽을 수 없습니다. 스캔(이미지) PDF는 지원하지 않습니다.');
    setRawText(text, md, nt, pp, tp);
    if (empty) toast('전체 '+pdf.numPages+'쪽 중 '+empty+'쪽은 글자가 없어 빠졌습니다(스캔된 쪽일 수 있습니다).');
    else if (_cmapMissing) toast('일부 글자는 글자표가 없어 빠졌습니다(한국어가 아닌 글꼴).');
    else if (nt && !tableMode && $('main-err').style.display !== 'block') toast('표 ' + nt + '개를 찾았습니다. 아래 "표 모양으로 보기"를 켜면 칸을 나눠 보여 줍니다.');
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
function setRawText(text, md, nt, pp, tp) {
  hideErr();
  _job++;
  src  = {plain:text, table:nt ? md : null, n:nt || 0, pp:pp || [], tp:tp || []};
  edit = {plain:text, table:nt ? md : ''};
  inDoc = true;
  syncMode();
  $('upload-area').style.display = 'none';
  $('result-area').style.display = 'block';
  $('status-bar').classList.add('show');
  setTabUI('mask');   // 올리면 가린 결과부터 보여 준다
  refresh();
}

function doReset() {
  _job++;
  rawText = ''; masked$ = ''; inDoc = false;
  src = {plain:'', table:null, n:0, pp:[], tp:[]}; edit = {plain:'', table:''};
  $('direct-input').value = '';
  $('raw-ta').value = '';          // 화면에서 숨긴 원문·결과도 지운다
  $('tv-mask').innerHTML = '';
  setDC(DROP_HTML);
  resetCommon();
}

// ─── 가리기 ───
// 켜고 끈 상태를 화면(원문 칸, 체크 칸, 저장 버튼)에 맞춘다
function syncMode() {
  var on = tableOn();
  rawText = on ? edit.table : edit.plain;
  $('raw-ta').value = rawText;
  $('tbl-opt').style.display = src.table !== null ? 'inline-flex' : 'none';
  $('tbl-chk').checked = on;
  $('tbl-n').textContent = src.n ? '(표 ' + src.n + '개)' : '';
  $('save-btn').textContent = on ? 'MD 저장' : 'TXT 저장';
  $('tbl-note').style.display = on ? 'block' : 'none';
}
// 고친 내용은 보기 방식마다 따로다. 한 방식에서 지운 글이 다른 방식에서는 남아 있으므로 바꿀 때 알린다
var EDIT_NOTE = '원본 글을 고친 내용은 보기 방식마다 따로 남습니다. 앞서 고친 내용은 이 화면에 들어 있지 않으니 결과를 다시 확인하세요.';
function edited(mode) { return src.table !== null && edit[mode] !== src[mode]; }
function setTableMode(on) {
  hideErr();
  var from = tableOn() ? 'table' : 'plain';
  tableMode = !!on;
  var to = tableOn() ? 'table' : 'plain';
  syncMode(); refresh();
  if (tableOn() === !!on && from !== to && edited(from)) showErr(EDIT_NOTE);
}
function refresh() {
  var map = {}, wm = pdfWords(), flat, res, chk = null;
  if (tableOn()) {
    // 표 모양으로 바꾸어 가려지지 않는 값이 하나라도 생기면 표 모양을 쓰지 않는다 (가리는 것이 먼저다)
    chk = tableCheck(wm);
    if (chk.lost) {
      var was = edited('table');
      tableMode = false; syncMode();
      showErr('이 문서는 표 모양으로 바꾸면 가려지지 않는 값이 ' + chk.lost + '건 생겨서 글 그대로 보여 줍니다.' + (was ? ' ' + EDIT_NOTE : ''));
    }
  }
  if (tableOn()) {
    var f = mdFlat(rawText), steps = [];
    flat = maskText(f.flat, wm, auditAdder(map), newSeq(), undefined, steps);
    masked$ = mdRestore(flat, f, steps);
    res = findResidue(flat, 9);
    chk.res.forEach(function(x){ if (res.indexOf(x) < 0) res.push(x); });   // 글 그대로일 때 뜨는 긴 숫자도 빠뜨리지 않는다
  } else {
    flat = masked$ = maskText(rawText, wm, auditAdder(map), newSeq());
    res = findResidue(flat, 9);
  }
  auditList = auditFromMap(map);
  residueList = res.map(function(x){ return {value:x, where:''}; });
  if (curTab === 'mask') renderMaskedView();
  renderSummary();
}
function onRawEdit(v) { rawText = v; edit[tableOn() ? 'table' : 'plain'] = v; refresh(); }

function renderMaskedView() {
  // 실제로 넣은 치환 코드만 강조한다 (원문에 원래 있던 대괄호 글자는 강조하지 않는다)
  var inserted = Object.create(null);
  auditList.forEach(function(x){ inserted[x.token] = true; });
  function chips(t) {
    return t.split(/(\[[^\]\n]+\])/g).map(function(p){
      return inserted[p] ? '<span class="code-chip">'+esc(p)+'</span>' : esc(p);
    }).join('');
  }
  if (!tableOn()) { $('tv-mask').innerHTML = chips(masked$); return; }
  // 표 모양: 저장되는 것은 마크다운 글자이고, 화면에는 칸이 맞는지 보기 쉽게 표로 그린다
  var lines = masked$.split('\n'), html = '', k = 0;
  while (k < lines.length) {
    if (!mdRow(lines[k])) {
      var t = [];
      while (k < lines.length && !mdRow(lines[k])) t.push(lines[k++]);
      t = t.join('\n').replace(/^\n+|\n+$/g, '');
      if (t) html += '<div class="md-text">' + chips(t) + '</div>';
      continue;
    }
    var trs = [], sep = false;
    while (k < lines.length && mdRow(lines[k])) {
      var cells = mdCells(lines[k++]);
      if (cells.every(function(c){ return /^-{3,}$/.test(c); })) { sep = true; continue; }
      if (!sep && cells.every(function(c){ return c === ''; })) continue;   // 머리글이 없는 표의 빈 머리글 행
      var tag = sep ? 'td' : 'th';
      trs.push('<tr>' + cells.map(function(c){
        return '<' + tag + '>' + c.split(BR).map(function(x){ return chips(x.replace(/\\\|/g, '|')); }).join('<br>') + '</' + tag + '>';
      }).join('') + '</tr>');
    }
    html += '<div class="md-wrap"><table class="md-table">' + trs.join('') + '</table></div>';
  }
  $('tv-mask').innerHTML = html;
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
  toast(success ? '가린 글을 복사했습니다' : '복사하지 못했습니다. 저장을 이용해 주세요.');
}
// 표 모양을 켰으면 마크다운(.md), 아니면 글자(.txt)로 저장한다
function dlTxt() {
  var md = tableOn();
  dlBlob(masked$, 'masked_' + dateStamp() + (md ? '.md' : '.txt'), (md ? 'text/markdown' : 'text/plain') + ';charset=utf-8');
  toast('가린 글을 저장했습니다.');
}

initCommon();
