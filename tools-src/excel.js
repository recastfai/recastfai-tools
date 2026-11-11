// ─────────────────────────────────────────────────────────────
// Excel 도구 전용: 파일 읽기, 표 미리보기, 저장
// ─────────────────────────────────────────────────────────────
var TOOL = {name:'Excel', key:'excel'};

var SAMPLE = [
  ['거래처명',      '사업자번호',    '대표자', '연락처',        '2024년 매출', '비고'],
  ['(주)가나다산업','123-45-67890',  '홍길동', '02-1234-5678',  116200000,    '주요고객'],
  ['마바사물산',    '234-56-78901',  '이순신', '031-234-5678',  89300000,     '매입처'],
  ['아자차인쇄소',  '345-67-89012',  '강감찬', '032-345-6789',  12500000,     '매입처'],
  ['카타파하전자',  '456-78-90123',  '윤봉길', '02-456-7890',   234000000,    '주요고객'],
  ['',              '',              '',       '합계',          452000000,    ''],
];

// sheets: [{name, hidden, cols, origRows, raw, maskRows, maskName}]
//   origRows: [[화면에 보이는 글자]]            raw: [[숫자 셀이면 {v:숫자, z:표시형식}, 아니면 null]]
//   maskRows: [[{v:가린 뒤 글자, masked:가렸는지}]]   maskName: 가린 뒤 시트 이름
//   내용이 없는 행은 모두 EMPTY 하나를 가리킨다 (끝 셀만 멀리 있는 시트에서 수백만 칸을 만들지 않게)
var EMPTY = [];
var PREVIEW_ROWS = 500, PREVIEW_COLS = 60;   // 미리보기에 그리는 한도. 저장 파일에는 전체가 들어간다
var sheets   = [];
var date1904 = false;
var curTab   = 'mask';
var curSheet = 0;

function hasDoc() { return sheets.length > 0; }

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
  if (/\.(xlsx|xls)$/i.test(f.name)) processFile(f);
  else showErr('Excel(.xlsx / .xls) 파일만 열 수 있습니다.');
}

function loadSample() {
  date1904 = false;
  sheets = [{
    name: 'Sheet1', hidden: false, cols: SAMPLE[0].length,
    origRows: SAMPLE.map(function(row){ return row.map(function(v){ return String(v==null?'':v); }); }),
    raw: SAMPLE.map(function(row){ return row.map(function(v){ return typeof v === 'number' ? {v:v, z:'#,##0'} : null; }); }),
    maskRows: null, maskName: null
  }];
  showResult();
}

async function processFile(file) {
  hideErr();
  try {
    var ab = await file.arrayBuffer();
    // 이름만 .xls이고 속은 글자(CSV·탭 구분·HTML 표)인 파일은 한글이 깨져 읽히므로 받지 않는다
    var h = new Uint8Array(ab.slice(0, 4));
    var isXlsx = h[0]===0x50 && h[1]===0x4B, isXls = h[0]===0xD0 && h[1]===0xCF && h[2]===0x11 && h[3]===0xE0;
    if (!isXlsx && !isXls) {
      showErr('이 파일은 이름만 엑셀이고 속은 글자 파일(CSV·HTML)입니다. 엑셀에서 열어 "다른 이름으로 저장 → Excel 통합 문서(.xlsx)"로 저장한 뒤 올려 주세요.');
      return;
    }
    // dateNF: 엑셀 기본 날짜 서식(14번)을 미국식 1/5/24가 아니라 2024-01-05로 읽는다. cellNF: 표시형식을 저장 때 다시 쓴다
    var wb = XLSX.read(ab, {type:'array', dateNF:'yyyy-mm-dd', cellNF:true});
    var meta = (wb.Workbook && wb.Workbook.Sheets) || [];
    date1904 = !!(wb.Workbook && wb.Workbook.WBProps && wb.Workbook.WBProps.date1904);   // 날짜 기준이 1904년인 파일(옛 맥 엑셀)
    var fmlCnt = 0;
    sheets = wb.SheetNames.map(function(n, si){
      var ws = wb.Sheets[n], cells = [], maxR = -1, maxC = -1;
      // 실제로 있는 셀만 돈다 (범위 전체를 돌지 않는다). 위치는 원본 그대로 둔다
      Object.keys(ws).forEach(function(addr){
        if (addr.charAt(0) === '!') return;
        var cell = ws[addr], pos = XLSX.utils.decode_cell(addr);
        if (!cell) return;
        if (cell.f) fmlCnt++;
        var v = cell.w !== undefined ? cell.w : (cell.v !== undefined ? String(cell.v) : '');
        var isNum = cell.t === 'n' && typeof cell.v === 'number';
        // 표시형식이 없는 긴 숫자는 1.00235E+12 처럼 줄여 보이므로 원래 숫자를 그대로 쓴다
        if (isNum && /e[+-]?\d+$/i.test(v) && Number.isInteger(cell.v)) v = String(cell.v);
        if (v === '') return;
        cells.push({r:pos.r, c:pos.c, v:v, raw:isNum ? {v:cell.v, z:cell.z} : null});
        if (pos.r > maxR) maxR = pos.r;
        if (pos.c > maxC) maxC = pos.c;
      });
      // 행 배열은 값이 있는 칸만 채운다 (먼 열에 셀 하나가 있어도 행마다 수만 칸을 만들지 않게)
      var cols = maxC + 1, origRows = new Array(maxR + 1).fill(EMPTY), raw = new Array(maxR + 1);
      cells.forEach(function(x){
        if (origRows[x.r] === EMPTY) { origRows[x.r] = []; raw[x.r] = []; }
        origRows[x.r][x.c] = x.v; raw[x.r][x.c] = x.raw;
      });
      return {name:n, hidden:!!(meta[si] && meta[si].Hidden), cols:cols, origRows:origRows, raw:raw, maskRows:null, maskName:null};
    });
    if (fmlCnt > 0) {
      $('fml-body').innerHTML =
        '이 파일에 수식 셀이 <strong>'+fmlCnt+'개</strong> 있습니다.<br><br>'
        +'저장할 때 수식은 빼고 <strong>지금 계산돼 있는 값</strong>만 넣습니다. '
        +'VLOOKUP·SUMIF 같은 수식의 결과도 값으로 들어가므로 참조 오류는 생기지 않습니다.';
      $('fml-modal').style.display = 'flex';
      $('fml-ok-btn').focus();
    } else {
      showResult();
    }
  } catch(e) {
    sheets = [];
    showErr('파일을 열 수 없습니다. 암호가 걸린 파일은 지원하지 않습니다. 일반 xlsx / xls 파일을 사용해 주세요.');
  }
}
function cancelFml()  { $('fml-modal').style.display='none'; sheets=[]; }
function confirmFml() { $('fml-modal').style.display='none'; showResult(); }

function showResult() {
  $('upload-area').style.display = 'none';
  $('result-area').style.display = 'block';
  $('status-bar').classList.add('show');
  hideErr();
  curSheet = 0;
  setTabUI('mask');   // 올리면 가린 결과부터 보여 준다
  refresh();
}

function doReset() {
  sheets = []; curSheet = 0;
  $('grid-orig').innerHTML = ''; $('grid-mask').innerHTML = '';
  $('sheet-tabs-orig').innerHTML = ''; $('sheet-tabs-mask').innerHTML = '';   // 시트 이름도 남기지 않는다
  $('preview-note').style.display = 'none';
  resetCommon();
}

// ─── 가리기 ───
// 엑셀 시트 이름에는 [ ] : \ / ? * 를 쓸 수 없고 31자까지다. 치환 코드의 대괄호는 소괄호로 바꾼다.
function safeSheetName(name, used) {
  var s = name.replace(/\[/g,'(').replace(/\]/g,')').replace(/[:\\\/?*]/g,' ').trim().slice(0, 31).replace(/^'+|'+$/g, '').trim() || '시트';
  var base = s, n = 2;
  while (used[s.toLowerCase()]) { var suf = '_' + (n++); s = base.slice(0, 31 - suf.length) + suf; }
  used[s.toLowerCase()] = true;
  return s;
}
// 머리글에 '사업자번호'·'등록번호'가 있는 열을 찾는다. 그 열에서는 붙여 쓴 10자리도 사업자번호로 본다.
function bizColumns(rows) {
  var cols = {};
  for (var r = 0; r < Math.min(rows.length, 15); r++) {
    for (var c = 0; c < rows[r].length; c++) {
      if (/사업자\s*(?:등록)?\s*번호|등록\s*번호|business\s*reg/i.test(rows[r][c] || '')) cols[c] = true;
    }
  }
  return cols;
}
function refresh() {
  var map = {}, add = auditAdder(map);
  var wm = compileWords(); // 정규식은 한 번만 만든다 (셀마다 만들지 않는다)
  var seq = newSeq();      // 번호표는 모든 시트가 함께 쓴다
  var used = {};
  residueList = [];
  sheets.forEach(function(sh){
    var maskedName = maskText(sh.name, wm, add, seq);
    sh.maskName = safeSheetName(maskedName, used);
    // 시트 이름이 그대로 남았으면 확인할 것으로 올린다 (Sheet1 같은 기본 이름은 뺀다)
    if (maskedName === normText(sh.name) && !/^(?:sheet|시트)\s*\d*$/i.test(sh.name.trim())) residueList.push({value:sh.name, where:'시트 이름'});
    var biz = bizColumns(sh.origRows);
    sh.maskRows = sh.origRows.map(function(row, r){
      if (row === EMPTY) return EMPTY;
      return row.map(function(v, c){
        if (!v) return {v:v, masked:false};
        var hits = 0;
        var out = maskText(v, wm, function(t, o, k){ hits++; add(t, o, k); }, seq, biz[c] ? 'bizno' : undefined);
        // 남은 긴 숫자: 숫자 셀(금액일 가능성이 큼)은 10자리부터, 글자 셀은 9자리부터 본다
        findResidue(out, sh.raw[r] && sh.raw[r][c] ? 10 : 9).forEach(function(x){
          residueList.push({value:x, where:sh.name + ' ' + seqLetters(c) + (r+1)});
        });
        return {v:out, masked:hits > 0};
      });
    });
  });
  auditList = auditFromMap(map);
  $('dl-btn').style.display = 'inline-flex';
  renderSheetTabs();
  renderGrids(curSheet);
  renderSummary();
}

// ─── 탭·표 ───
function switchTab(tab) {
  setTabUI(tab);
  if (sheets.length) renderGrids(curSheet);
}
function setTabUI(tab) {
  curTab = tab;
  $('tab-orig').classList.toggle('active', tab==='orig');
  $('tab-mask').classList.toggle('active', tab==='mask');
  $('sheet-tabs-orig').style.display = tab==='orig'?'flex':'none';
  $('sheet-tabs-mask').style.display = tab==='mask'?'flex':'none';
  $('grid-orig').style.display = tab==='orig'?'block':'none';
  $('grid-mask').style.display = tab==='mask'?'block':'none';
}
function renderSheetTabs() {
  ['orig','mask'].forEach(function(t){
    $('sheet-tabs-'+t).innerHTML = sheets.map(function(sh,i){
      var label = t === 'mask' ? sh.maskName : sh.name;
      return '<button class="sheet-tab'+(i===curSheet?' active':'')+'" onclick="renderGrids('+i+')">'+esc(label)
        +(sh.hidden ? ' <span class="sheet-hidden">숨김 시트</span>' : '')+'</button>';
    }).join('');
  });
}
// 보이는 탭(원본 또는 마스킹)의 표만 그린다. 안 보이는 쪽은 비워 둔다.
// 큰 표는 처음 PREVIEW_ROWS행·PREVIEW_COLS열까지만 그린다 (가리기와 저장은 전체에 한다).
function renderGrids(shIdx) {
  var sh = sheets[shIdx];
  if (!sh) return;
  curSheet = shIdx;
  ['orig','mask'].forEach(function(t){
    $('sheet-tabs-'+t).querySelectorAll('.sheet-tab').forEach(function(b,i){ b.classList.toggle('active', i===shIdx); });
  });
  var isMask = curTab === 'mask';
  var all = isMask ? (sh.maskRows || []) : sh.origRows;
  var rows = all.slice(0, PREVIEW_ROWS), cols = Math.min(sh.cols, PREVIEW_COLS);
  var blank = new Array(cols + 1).join('<td></td>');

  var parts = ['<table class="excel-table"><thead><tr><th class="rh"></th>'];
  for (var c=0; c<cols; c++) parts.push('<th>'+seqLetters(c)+'</th>');
  parts.push('</tr></thead><tbody>');
  rows.forEach(function(row, ri){
    parts.push('<tr><td class="rh">'+(ri+1)+'</td>');
    if (row === EMPTY) parts.push(blank);
    else for (var ci=0; ci<cols; ci++) {
      var cell = row[ci];
      if (cell === undefined) parts.push('<td></td>');
      else if (isMask) parts.push('<td'+(cell.masked?' class="masked"':'')+'>'+esc(cell.v)+'</td>');
      else parts.push('<td>'+esc(cell)+'</td>');
    }
    parts.push('</tr>');
  });
  parts.push('</tbody></table>');
  $(isMask?'grid-mask':'grid-orig').innerHTML = parts.join('');
  $(isMask?'grid-orig':'grid-mask').innerHTML = '';
  var cut = all.length > PREVIEW_ROWS || sh.cols > PREVIEW_COLS;
  var note = $('preview-note');
  note.style.display = cut ? 'block' : 'none';
  note.textContent = cut ? '미리보기는 처음 '+PREVIEW_ROWS+'행·'+PREVIEW_COLS+'열까지만 보여 줍니다. 가리기와 저장은 전체('+all.length+'행·'+sh.cols+'열)에 적용됩니다.' : '';
}

// ─── 저장 ───
// 가려지지 않은 숫자·날짜 셀은 숫자 그대로(표시형식 포함) 넣는다. 나머지는 글자로 넣는다.
function dlMasked() {
  var nb = XLSX.utils.book_new();
  if (date1904) nb.Workbook = {WBProps:{date1904:true}};   // 날짜 기준을 원본과 같게 둔다
  sheets.forEach(function(sh){
    var ws = {};
    sh.maskRows.forEach(function(row, r){
      if (row === EMPTY) return;
      row.forEach(function(c, ci){
        if (c.v === '') return;
        var raw = sh.raw[r] && sh.raw[r][ci], cell;
        if (!c.masked && raw) { cell = {t:'n', v:raw.v}; if (raw.z && raw.z !== 'General') cell.z = raw.z; }
        else cell = {t:'s', v:c.v};
        ws[XLSX.utils.encode_cell({r:r, c:ci})] = cell;
      });
    });
    ws['!ref'] = XLSX.utils.encode_range({s:{r:0,c:0}, e:{r:Math.max(sh.maskRows.length-1,0), c:Math.max(sh.cols-1,0)}});
    XLSX.utils.book_append_sheet(nb, ws, sh.maskName);
  });
  XLSX.writeFile(nb, 'masked_' + dateStamp() + '.xlsx');
  toast(residueList.length ? '저장했습니다. 가려지지 않은 긴 숫자 '+residueList.length+'건이 들어 있습니다.' : '가린 파일을 저장했습니다.');
}

initCommon();
