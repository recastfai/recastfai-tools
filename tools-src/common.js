// ─────────────────────────────────────────────────────────────
// 두 도구가 함께 쓰는 화면 코드: 단어 목록, 패턴 켜고 끄기, 보관 방식, 확인 창,
// 결과 요약, 저장 전 확인, 치환 대응표. build.mjs가 두 HTML에 그대로 넣는다.
// 도구별 파일(excel.js / pdf.js)은 TOOL, hasDoc(), refresh(), doReset() 을 제공한다.
// ─────────────────────────────────────────────────────────────

// ─── 상태 ───
var words = [];        // [{original, token, id}]
var patSt = {};        // 패턴 id → 켜짐 여부
var step  = 1;
var auditList = [];    // [{type:'user'|'pattern', original, token, count}]  치환 한 종류당 한 줄
var residueList = [];  // [{value, where}]  가린 뒤에도 남은 긴 숫자
var isPersist = false; // false: 탭을 닫으면 단어 목록 삭제(sessionStorage), true: 브라우저에 보관(localStorage)

function $(id) { return document.getElementById(id); }

// ─── 단어 목록 보관 ───
// 기본은 보관하지 않는다: 단어는 이 탭의 메모리에만 있고 디스크에 쓰지 않는다 (탭을 닫거나 새로 고치면 사라진다).
// 보관을 켜면 localStorage에 글자 그대로 저장한다. localStorage는 같은 사이트의 다른 페이지도 읽을 수 있고,
// 내려받아 연 파일(file://)에서는 다른 HTML 파일과도 같이 쓰이므로 file://에서는 보관을 켤 수 없게 한다.
var CAN_PERSIST = location.protocol !== 'file:';
function cleanWords(a) {
  // 저장값이 깨졌거나 모양이 다르면 버린다
  if (!Array.isArray(a)) return [];
  return a.filter(function(w){ return w && typeof w.original==='string' && typeof w.token==='string'; })
    .map(function(w,i){ return {original:w.original, token:w.token, id:Number(w.id)||(i+1)}; });
}
function saveWords() {
  if (!isPersist) return;
  try {
    // 다른 탭에서 보관을 껐으면 이 탭도 끈다 (꺼 둔 뒤에 목록이 다시 저장되지 않게)
    if (localStorage.getItem(PERSIST_KEY) !== '1') { isPersist = false; localStorage.removeItem(LS_KEY); renderPersistUI(); return; }
    localStorage.setItem(LS_KEY, JSON.stringify(words));
  } catch(e){}
}
function loadWords() {
  if (!isPersist) return [];
  try { return cleanWords(JSON.parse(localStorage.getItem(LS_KEY) || '[]')); } catch(e){ return []; }
}
function togglePersist() {
  if (!CAN_PERSIST) { toast('내려받아 연 파일에서는 단어 목록을 보관할 수 없습니다.'); return; }
  var next = !isPersist;
  // 저장소를 먼저 고치고, 성공했을 때만 화면을 바꾼다. 선택값은 맨 마지막에 쓴다.
  try {
    if (next) localStorage.setItem(LS_KEY, JSON.stringify(words));
    else localStorage.removeItem(LS_KEY);
    localStorage.setItem(PERSIST_KEY, next ? '1' : '0');
  } catch(e) {
    toast('이 브라우저는 저장소 사용이 막혀 있어 보관 방식을 바꿀 수 없습니다.');
    return;
  }
  isPersist = next;
  renderPersistUI();
  toast(isPersist ? '단어 목록을 이 브라우저에 보관합니다. 브라우저를 닫아도 남습니다.'
                  : '보관을 껐습니다. 저장해 둔 단어 목록을 지웠습니다.');
}
function renderPersistUI() {
  var tog = $('persist-toggle'), stat = $('persist-status'), desc = $('persist-desc');
  tog.className = 'persist-toggle ' + (isPersist ? 'on' : 'off');
  tog.setAttribute('aria-pressed', isPersist ? 'true' : 'false');
  stat.className = 'persist-status ' + (isPersist ? 'on-st' : 'off-st');
  if (isPersist) {
    stat.textContent = '이 브라우저에 보관 중';
    desc.innerHTML = '등록한 단어(거래처명 등)가 <strong>이 브라우저에 글자 그대로 저장됩니다.</strong> 혼자 쓰는 PC에서만 켜세요.';
  } else {
    stat.textContent = '보관하지 않음';
    desc.innerHTML = '등록한 단어는 이 탭에만 있고 <strong>탭을 닫거나 새로 고치면 지워집니다.</strong> 고객 정보를 다룰 때는 이 상태로 두세요.'
      + (CAN_PERSIST ? '' : ' 내려받아 연 파일에서는 보관을 켤 수 없습니다.');
  }
}

// ─── 알림 ───
function toast(msg) {
  var t = $('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg; t.style.opacity = '1';
  clearTimeout(t._timer);
  t._timer = setTimeout(function(){ t.style.opacity = '0'; }, 3000);
}
function showErr(m) {
  var e = $('main-err'); e.textContent = m; e.style.display = 'block';
  if (e.scrollIntoView) e.scrollIntoView({block:'center'});   // 화면 밖에 떠서 못 보는 일이 없게
}
function hideErr() { $('main-err').style.display = 'none'; }

// ─── 시작 ───
function initCommon() {
  $('github-link').href = GITHUB_URL;
  // 보관 방식 복원 (이 선택 자체는 localStorage에 둔다). 저장소가 막힌 브라우저에서는 보관하지 않는다
  try { isPersist = CAN_PERSIST && localStorage.getItem(PERSIST_KEY) === '1'; } catch(e){ isPersist = false; }
  try { sessionStorage.removeItem(LS_KEY); } catch(e){}   // 예전 버전이 남긴 탭 저장값을 치운다
  if (!isPersist) { try { localStorage.removeItem(LS_KEY); } catch(e){} }   // 보관하지 않는 상태에서는 저장된 목록이 없어야 한다
  renderPersistUI();
  words = loadWords();
  PATTERNS.forEach(function(p){ patSt[p.id] = p.on; });
  renderPatterns();
  renderWords();
  renderStepBar();

  var dz = $('drop-zone');
  dz.addEventListener('keydown', function(e){
    if (e.target === dz && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); $('file-input').click(); }
  });
  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape') {
      if ($('confirm-modal').style.display !== 'none') closeModal();
      else if (typeof cancelFml === 'function' && $('fml-modal') && $('fml-modal').style.display !== 'none') cancelFml();
      return;
    }
    // 한글을 조합하는 중의 Enter는 글자 확정용이므로 넘긴다
    if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229 && (e.target.id === 'inp-orig' || e.target.id === 'inp-tok')) addWord();
  });
}

// ─── 단계 ───
function renderStepBar() {
  var SS = [{n:1,l:'파일 올리기'},{n:2,l:'가린 결과 확인·저장'}];
  $('step-bar').innerHTML = SS.map(function(s){
    var st = step > s.n ? 'done' : step === s.n ? 'active' : 'idle';
    return '<div class="step-item '+st+'"><span class="step-dot '+st+'">'+(step>s.n?'✓':s.n)+'</span>'+s.l+'</div>';
  }).join('');
}
function setStep(n) { if (step !== n) { step = n; renderStepBar(); } }

// ─── 확인 창 ───
var _modalReturn = null;
function showModal(title, bodyHtml, okLabel, danger, cb) {
  $('modal-title').textContent = title;
  // bodyHtml에는 코드에 적힌 고정 문구만 넘긴다 (사용자 입력을 넣지 말 것)
  $('modal-body').innerHTML = bodyHtml;
  var btn = $('modal-ok-btn');
  btn.textContent = okLabel;
  btn.className = 'btn' + (danger ? ' btn-warn' : '');
  btn.onclick = function(){ closeModal(); if (cb) cb(); };
  _modalReturn = document.activeElement;
  $('confirm-modal').style.display = 'flex';
  btn.focus();
}
function closeModal() {
  $('confirm-modal').style.display = 'none';
  if (_modalReturn && _modalReturn.focus) { try { _modalReturn.focus(); } catch(e){} }
  _modalReturn = null;
}
function confirmReset()     { showModal('처음으로', '지금 올린 파일과 결과를 닫습니다.<br>등록한 단어와 패턴 설정은 <strong>그대로 남습니다.</strong>', '처음으로', false, doReset); }
function confirmFileReset() { showModal('파일 교체', '지금 올린 파일과 결과를 닫고 다른 파일을 올립니다.<br>등록한 단어와 패턴 설정은 <strong>그대로 남습니다.</strong>', '파일 교체', false, doReset); }
function confirmClearWords(){
  if (!words.length) return;
  showModal('단어 목록 전체 삭제', '등록된 <strong>'+words.length+'개</strong>의 단어가 모두 삭제됩니다.', '전체 삭제', true, function(){
    words=[]; saveWords(); renderWords(); if (hasDoc()) refresh();
  });
}

// ─── 패턴 ───
function renderPatterns(focusId) {
  $('pattern-list').innerHTML = PATTERNS.map(function(p){
    var on = !!patSt[p.id];
    return '<div class="pat-row">'
      +'<div><div class="p-label">'+p.label+'</div>'
      +'<div class="p-ex">'+p.ex+' → <span class="p-tok">'+patToken(p,1)+'</span></div></div>'
      +'<button class="toggle '+(on?'on':'off')+'" data-pat="'+p.id+'" aria-pressed="'+on+'" aria-label="'+p.label+' 가리기" onclick="togglePat(\''+p.id+'\')">'
      +'<span class="toggle-knob"></span></button></div>';
  }).join('');
  if (focusId) { var b = document.querySelector('[data-pat="'+focusId+'"]'); if (b) b.focus(); }
}
function togglePat(id) { patSt[id] = !patSt[id]; renderPatterns(id); if (hasDoc()) refresh(); }

// ─── 단어 ───
// 쉼표·줄바꿈·세미콜론으로 나눠 여러 개를 한 번에 등록한다 (치환 코드를 직접 적은 경우는 한 개로 본다)
function addWord() {
  var raw = $('inp-orig').value.trim();
  if (!raw) { showErr('가릴 단어를 입력해 주세요.'); return; }
  var label = $('sel-label').value;
  var custom = $('inp-tok').value.trim();
  var parts = custom ? [raw] : raw.split(/[,;\n]+/).map(function(s){ return s.trim(); }).filter(Boolean);
  // "ABC Co., Ltd."처럼 쉼표가 이름의 일부이면 나누지 않는다
  if (parts.some(function(x){ return /^(?:co|ltd|inc|corp|llc|gmbh|plc|l\.?p|s\.?a)\.?$/i.test(x); })) parts = [raw];
  if (!parts.length) { showErr('가릴 단어를 입력해 주세요.'); return; }
  var short = parts.filter(function(x){ return x.replace(/\s/g, '').length < 2; });
  if (short.length) { showErr('한 글자는 너무 많은 곳을 가려서 등록할 수 없습니다: ' + short.join(', ')); return; }
  var added = 0, dup = [];
  parts.forEach(function(orig){
    if (words.some(function(w){ return w.original.toLowerCase() === orig.toLowerCase(); })) { dup.push(orig); return; }
    words.push({original:orig, token:custom || nextToken(label), id:Date.now() + added});
    added++;
  });
  if (!added) { showErr('"'+dup.join(', ')+'"은(는) 이미 등록되어 있습니다.'); return; }
  saveWords(); renderWords();
  $('inp-orig').value = ''; $('inp-tok').value = '';
  if (dup.length) showErr('이미 등록된 단어는 건너뛰었습니다: ' + dup.join(', ')); else hideErr();
  if (hasDoc()) refresh();
}
// "저장 전 확인"에서 남은 숫자를 바로 가린다
function quickMask(i) {
  var r = residueList[i]; if (!r) return;
  if (!words.some(function(w){ return w.original === r.value; })) {
    words.push({original:r.value, token:nextToken('기타'), id:Date.now()});
    saveWords(); renderWords();
  }
  if (hasDoc()) refresh();
}
function removeWord(id) {
  words = words.filter(function(w){ return w.id!==id; });
  saveWords(); renderWords(); if (hasDoc()) refresh();
  $('inp-orig').focus();
}
function renderWords() {
  var wrap = $('word-list-wrap'), emp = $('word-empty'), hint = $('scroll-hint'), title = $('l1-title');
  wrap.querySelectorAll('.word-item').forEach(function(e){ e.remove(); });
  var b = title.querySelector('.cnt-badge');
  if (b) b.remove();
  if (words.length) {
    var nb = document.createElement('span');
    nb.className='cnt-badge'; nb.textContent=words.length+'개'; title.appendChild(nb);
  }
  if (!words.length) { emp.style.display='block'; hint.classList.remove('show'); return; }
  emp.style.display='none';
  words.forEach(function(w,i){
    var div=document.createElement('div'); div.className='word-item';
    div.innerHTML='<span class="word-num">'+(i+1)+'</span>'
      +'<span class="word-orig" title="'+esc(w.original)+'">'+esc(w.original)+'</span>'
      +'<span class="word-arr">→</span>'
      +'<span class="word-tok">'+esc(w.token)+'</span>'
      +'<button class="word-del" aria-label="'+esc(w.original)+' 삭제" onclick="removeWord('+Number(w.id)+')">✕</button>';
    wrap.appendChild(div);
  });
  setTimeout(function(){ hint.classList.toggle('show', wrap.scrollHeight > wrap.clientHeight+8); }, 50);
}
function exportPresetXlsx() {
  if (!words.length) { showErr('내보낼 단어가 없습니다.'); return; }
  hideErr();
  var aoa = [['원본 단어','치환 코드']].concat(words.map(function(w){ return [w.original, w.token]; }));
  var ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{wch:30},{wch:20}];
  var nb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(nb, ws, '마스킹 단어 목록');
  XLSX.writeFile(nb, 'masking_words_' + dateStamp() + '.xlsx');
}

// ─── 결과 요약: 가린 건수, 꺼 둔 패턴, 남은 긴 숫자 ───
// 도구별 refresh()가 auditList·residueList를 채운 뒤 부른다
function renderSummary() {
  var total = auditList.reduce(function(s,x){ return s + x.count; }, 0);
  var res = residueList.length;
  var off = PATTERNS.filter(function(p){ return !patSt[p.id]; }).map(function(p){ return p.label; });

  var ts = $('stat-tok');
  ts.textContent = total > 0 ? total+'건 가림' : '가려진 항목 없음';
  ts.className = 'stat-badge' + (total > 0 ? '' : ' stat-zero');
  ts.style.display = 'inline';
  var so = $('stat-off');
  so.textContent = off.length ? '꺼짐: ' + off.join('·') : '';
  so.style.display = off.length ? 'inline' : 'none';
  var sr = $('stat-res');
  sr.textContent = res ? '확인 필요 '+res+'건' : '';
  sr.style.display = res ? 'inline' : 'none';

  var h = $('step-hint');
  h.style.display = 'block';
  if (total === 0) {
    h.textContent = '가려진 것이 없습니다. 왼쪽에서 단어를 등록하거나 패턴을 켜 주세요.';
    h.className = 'step-hint warn';
  } else if (res) {
    h.textContent = total+'건을 가렸습니다. 가려지지 않은 긴 숫자 '+res+'건이 남아 있으니 아래 "저장 전 확인"을 보세요.';
    h.className = 'step-hint warn';
  } else {
    h.textContent = total+'건을 가렸습니다. 이름·상호·주소는 등록한 단어만 가려지니 결과를 훑어본 뒤 저장하세요.';
    h.className = 'step-hint';
  }
  setStep(2);
  renderResidue();
  renderAudit();
  $('ai-guide').style.display = total > 0 ? 'block' : 'none';
}

// ─── 저장 전 확인 ───
var RESIDUE_SHOW = 50;
function renderResidue() {
  $('check-area').style.display = 'block';
  var box = $('residue-box');
  if (!residueList.length) { box.innerHTML = '<p class="res-none">남은 긴 숫자를 찾지 못했습니다. 띄어 쓴 번호와 이름·상호·주소는 결과에서 직접 확인하세요.</p>'; return; }
  var rows = residueList.slice(0, RESIDUE_SHOW).map(function(r, i){
    return '<div class="res-row"><span class="res-val">'+esc(r.value)+'</span>'
      +'<span class="res-where">'+esc(r.where || '')+'</span>'
      +'<button class="btn-sm" onclick="quickMask('+i+')">가리기</button></div>';
  }).join('');
  var more = residueList.length > RESIDUE_SHOW ? '<p class="res-none">외 '+(residueList.length - RESIDUE_SHOW)+'건이 더 있습니다.</p>' : '';
  box.innerHTML = '<div class="res-list">'+rows+'</div>'+more;
}

// ─── 치환 대응표 ───
function typeLabel(x) { return x.type === 'user' ? '등록 단어' : '자동'; }
function renderAudit() {
  var area = $('audit-area');
  if (!auditList.length) { area.style.display='none'; $('audit-tbody').innerHTML = ''; return; }
  area.style.display='block';
  var total = auditList.reduce(function(s,x){ return s + x.count; }, 0);
  $('audit-count').textContent = auditList.length+'종 · '+total+'건';
  $('audit-tbody').innerHTML = auditList.map(function(x,i){
    return '<tr>'
      +'<td class="num">'+(i+1)+'</td>'
      +'<td><span class="audit-type '+(x.type==='user'?'audit-user':'audit-pat')+'">'+typeLabel(x)+'</span></td>'
      +'<td class="orig">'+esc(x.original)+'</td>'
      +'<td><span class="code-chip">'+esc(x.token)+'</span></td>'
      +'<td>'+x.count+'</td>'
      +'</tr>';
  }).join('');
}
function auditHeaderLines() {
  var total = auditList.reduce(function(s,x){ return s + x.count; }, 0);
  return ['Recast Finance AI '+TOOL.name+' 마스킹 v'+TOOL_VERSION+' — 치환 대응표',
          '생성: '+new Date().toLocaleString('ko-KR'),
          '치환 코드 '+auditList.length+'종 · 치환 '+total+'건'];
}
function dlAuditTxt() {
  if (!auditList.length) return;
  var lines = auditHeaderLines().concat(['─'.repeat(60),''])
    .concat(auditList.map(function(x,i){ return String(i+1).padStart(3,'0')+'. ['+typeLabel(x)+'] "'+x.original+'" → '+x.token+'  ('+x.count+'회)'; }))
    .concat(['','─'.repeat(60),'※ 이 파일에는 원본 민감정보가 들어 있습니다. 원본 파일과 같은 수준으로 보관하세요.']);
  dlBlob(lines.join('\n'), TOOL.key+'_mapping_'+dateStamp()+'.txt', 'text/plain;charset=utf-8');
}
function dlAuditXlsx() {
  if (!auditList.length) return;
  var aoa = [['#','구분','원본값','치환 코드','횟수']]
    .concat(auditList.map(function(x,i){ return [i+1, typeLabel(x), x.original, x.token, x.count]; }))
    .concat([[]], auditHeaderLines().map(function(l){ return [l]; }), [['이 파일에는 원본 민감정보가 들어 있습니다.']]);
  var ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{wch:6},{wch:12},{wch:30},{wch:18},{wch:8}];
  var nb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(nb, ws, '치환 대응표');
  XLSX.writeFile(nb, TOOL.key+'_mapping_'+dateStamp()+'.xlsx');
}
// 치환 한 건을 대응표에 더한다 (도구별 refresh에서 onHit으로 쓴다)
function auditAdder(map) {
  return function(type, original, token) {
    var key = original + '|||' + token;
    (map[key] || (map[key] = {type:type, original:original, token:token, count:0})).count++;
  };
}
function auditFromMap(map) { return Object.keys(map).map(function(k){ return map[k]; }).sort(function(a,b){ return b.count - a.count; }); }

// 처음 화면으로 돌아갈 때 공통으로 지울 것
function resetCommon() {
  auditList = []; residueList = [];
  ['audit-area','check-area','ai-guide'].forEach(function(id){ $(id).style.display = 'none'; });
  $('audit-tbody').innerHTML = ''; $('residue-box').innerHTML = '';
  $('step-hint').style.display = 'none';
  $('file-input').value = '';
  $('status-bar').classList.remove('show');
  $('upload-area').style.display = 'block';
  $('result-area').style.display = 'none';
  hideErr(); setStep(1);
}

// ─── 유틸 ───
function dlBlob(content, name, mime){
  var blob = new Blob([content], {type:mime});
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement('a');
  a.href = url; a.download = name; a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(function(){ URL.revokeObjectURL(url); document.body.removeChild(a); }, 400);
}
function dateStamp() {
  var d = new Date();
  return d.getFullYear() + ('0'+(d.getMonth()+1)).slice(-2) + ('0'+d.getDate()).slice(-2);
}
function copyEmail() {
  var done = function(){ toast('이메일 주소가 복사되었습니다'); };
  var fallback = function(){
    var ta = document.createElement('textarea');
    ta.value = EMAIL_ADDR; ta.style.cssText = 'position:fixed;opacity:0;';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch(e){}
    document.body.removeChild(ta);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(EMAIL_ADDR).then(done).catch(fallback);
  else fallback();
}
