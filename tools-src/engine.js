// ─────────────────────────────────────────────────────────────
// 마스킹 엔진 — Excel 도구와 PDF 도구가 함께 쓰는 단 하나의 원본.
// build.mjs가 이 파일을 두 HTML에 그대로 넣는다. 패턴·치환 규칙은 여기서만 고친다.
// ─────────────────────────────────────────────────────────────
var ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// 사업자등록번호 검증식 (국세청 방식. Presidio KrBrnRecognizer와 같은 계산)
function bizChecksumOk(d) {
  if (!/^\d{10}$/.test(d)) return false;
  var k = [1,3,7,1,3,7,1,3,5], sum = 0, i;
  for (i = 0; i < 8; i++) sum += (+d.charAt(i)) * k[i];
  var last = (+d.charAt(8)) * 5;
  sum += Math.floor(last / 10) + last;
  return (10 - (sum % 10)) % 10 === +d.charAt(9);
}
// 앞 6자리가 실제 날짜(월 01~12, 일 01~31)인가
function ymdOk(d) {
  var mm = +d.substr(2, 2), dd = +d.substr(4, 2);
  return mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31;
}
// 일치한 글자 바로 앞 30자(같은 줄) 안에 사업자번호임을 알리는 말이 있는가
function bizWordNear(text, index) {
  var from = Math.max(0, index - 30), before = text.slice(from, index);
  var nl = before.lastIndexOf('\n');
  if (nl >= 0) before = before.slice(nl + 1);
  return /사업자|등록\s*번호|business\s*reg|BRN/i.test(before);
}

// 패턴 목록. tok는 치환 코드 이름(번호는 자동), norm은 "같은 값"을 견주는 방법.
// iso: 앞뒤로 숫자나 '-숫자'가 이어지면(더 긴 번호의 일부이면) 가리지 않는다.
//      \b 를 쓰지 않으므로 "ID123-45-67890"처럼 영문에 붙은 번호도 잡는다.
// check(m, text, index, hint)가 false면 그 후보는 가리지 않는다.
//   hint: 엑셀에서 그 셀이 속한 열의 머리글 종류(예: 'bizno'). 없으면 undefined.
// 하이픈 앞뒤의 공백·줄바꿈(\s?)은 허용한다: 좁은 칸에서 "123-45-⏎67890"으로 갈린 번호도 잡는다.
var PATTERNS = [
  // 이메일·웹주소를 맨 먼저 가린다. 뒤에 두면 아이디 속 번호(kim01012345678@…)를 전화 패턴이 먼저 건드려 주소가 남는다.
  // 이메일의 앞 갈래들은 좁은 칸에서 줄이 바뀐 주소(hong@ganada.⏎co.kr, hong@naver.⏎com, kim@garam-⏎precision.kr)
  {id:'email', label:'이메일', ex:'abc@co.com', tok:'이메일', norm:'lower', on:true,
   re:/[a-zA-Z0-9._%+\-]{1,64}@(?:[a-zA-Z0-9\-]+\.)+\n(?:[a-zA-Z0-9\-]+\.)+[a-zA-Z]{2,}|[a-zA-Z0-9._%+\-]{1,64}@(?:[a-zA-Z0-9\-]+\.)+\n(?:com|net|org|kr|io|biz|info)(?![a-zA-Z])|[a-zA-Z0-9._%+\-]{1,64}@[a-zA-Z0-9.\-]*-\n[a-zA-Z0-9\-]+(?:\.[a-zA-Z0-9\-]+)*\.[a-zA-Z]{2,}|[a-zA-Z0-9._%+\-]{1,64}@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g},
  // 웹주소: 회사 도메인은 회사를 알려 준다
  {id:'url', label:'웹주소', ex:'www.company.co.kr', tok:'웹주소', norm:'lower', on:true,
   re:/(?:https?:\/\/|www\.)[a-zA-Z0-9\-]+(?:\.[a-zA-Z0-9\-]+)+(?:[\/?#][^\s<>"')\]]*)?/g},
  // 사업자등록번호: 000-00-00000 은 그대로 가린다.
  // 하이픈이 없는 것은 금액·수량과 헷갈리므로 근거가 있을 때만 가린다.
  //   붙여 쓴 10자리: 근처에 '사업자·등록번호' 글자가 있거나 엑셀 열 머리글이 그것일 때
  //   공백으로 띄운 000 00 00000: 위 근거가 있거나 검증식이 맞을 때
  {id:'bizno', label:'사업자등록번호', ex:'130-81-00276', tok:'사업자번호', norm:'digits', on:true, iso:true,
   re:/\d{3}\s?-\s?\d{2}\s?-\s?\d{5}|\d{3} \d{2} \d{5}|\d{10}/g,
   check:function(m, text, index, hint){
     if (m.indexOf('-') >= 0) return true;
     if (hint === 'bizno' || bizWordNear(text, index)) return true;
     return m.indexOf(' ') >= 0 && bizChecksumOk(m.replace(/\D/g, ''));
   }},
  // 전화번호: 02-, 031-, 010-, 0507-, +82-10-, 02)1234-5678, 010.1234.5678, 010 - 1234 - 5678,
  //           붙여 쓴 휴대폰 01012345678, 해외 번호 +1 415 555 0100
  {id:'phone', label:'전화번호', ex:'010-1234-5678', tok:'연락처', norm:'phone', on:true, iso:true,
   re:/(?:\+82[-.\s]?0?|82[-\s]0?|0)[1-9]\d{0,2}\s?[-.\s)]\s?\d{3,4}\s?[-.\s]\s?\d{4}|01[016789]\d{7,8}|\+\d{1,3}[-.\s]?\d{1,4}(?:[-.\s]\d{2,4}){2,3}/g},
  // 주민·외국인·법인등록번호: 6자리-7자리. 하이픈 없이 붙였거나 띄운 13자리는 앞 6자리가 날짜이고 7번째가 1~8일 때만
  {id:'jumin', label:'주민·외국인·법인등록번호', ex:'800101-1234567', tok:'등록번호', norm:'digits', on:true, iso:true,
   re:/\d{6}\s?-\s?\d{7}|\d{6} \d{7}|\d{13}/g,
   check:function(m){
     if (m.indexOf('-') >= 0) return true;
     var d = m.replace(/\D/g, '');
     return ymdOk(d) && /[1-8]/.test(d.charAt(6));
   }},
  // 계좌·카드번호: 하이픈으로 나눈 2~5묶음, 숫자 합계 10~16자리(2묶음은 11자리부터). 은행마다 자릿수가 달라 묶음 모양만 본다.
  // 2026-10-000123 처럼 연도-월로 시작하는 짧은 전표번호는 뺀다. 하이픈 없는 계좌는 규칙이 없어 못 잡는다.
  {id:'acct', label:'계좌·카드번호', ex:'110-123-456789', tok:'계좌번호', norm:'digits', on:true, iso:true,
   re:/\d{2,8}(?:\s?-\s?\d{2,8}){1,4}/g,
   check:function(m){
     var t = m.replace(/\s/g, ''), n = t.replace(/\D/g, '').length, groups = t.split('-').length;
     if (n < (groups === 2 ? 11 : 10) || n > 16) return false;
     // 전화번호·사업자번호·등록번호 모양은 그 패턴의 몫이다 (그 패턴을 꺼 두었으면 가리지 않는다)
     if (/^0[1-9]\d{0,2}-\d{3,4}-\d{4}$/.test(t) || /^\d{3}-\d{2}-\d{5}$/.test(t) || /^\d{6}-\d{7}$/.test(t)) return false;
     return !isDocNo(t);
   }},
  // 여권번호: M12345678, M123A4567 (Presidio KrPassportRecognizer와 같은 모양). 앞뒤에 영문·숫자가 붙으면 뺀다
  {id:'passport', label:'여권번호', ex:'M12345678', tok:'여권번호', norm:'lower', on:true,
   re:/[MSROD]\d{8}|[MSROD]\d{3}[A-Z]\d{4}/g,
   check:function(m, text, index){
     return !/[A-Za-z0-9]/.test(text.charAt(index-1)) && !/[A-Za-z0-9]/.test(text.charAt(index + m.length));
   }}
];

// 2026-10-000123 처럼 연도-월로 시작하고 뒤가 6자리 이하인 번호는 전표·문서번호로 본다
function isDocNo(t) { return /^(?:19|20)\d{2}-(?:0[1-9]|1[0-2])-\d{1,6}$/.test(t.replace(/\s/g, '')); }
// 하이픈처럼 보이는 다른 글자(‑ – — − － 등)와 전각 숫자·＠를 보통 글자로 바꾼다.
// PDF에서 뽑은 글은 하이픈이 U+2011 같은 글자로 나오는 일이 있어, 바꾸지 않으면 번호 패턴이 하나도 안 잡힌다.
function normText(text) {
  return text.replace(/[‐-―−﹘﹣－]/g, '-')
    .replace(/[０-９]/g, function(ch){ return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0); })
    .replace(/＠/g, '@');
}
// 앞뒤로 숫자나 '-숫자'가 이어지면 더 긴 번호의 한 토막이다
function isolated(text, start, end) {
  var b = text.charAt(start-1), a = text.charAt(end);
  if (/\d/.test(b) || (b === '-' && /\d/.test(text.charAt(start-2)))) return false;
  if (/\d/.test(a) || (a === '-' && /\d/.test(text.charAt(end+1)))) return false;
  return true;
}
// 한 패턴이 text에서 가릴 자리를 모두 찾는다: [{s:시작, e:끝, m:글자}]
// 버린 후보는 그 자리의 다음 글자부터 다시 찾는다 (버린 후보가 뒤따르는 진짜 번호를 삼키지 않게).
function findPattern(text, p, hint) {
  var re = p.re, out = [], m;
  re.lastIndex = 0;
  while ((m = re.exec(text)) !== null) {
    if (m[0] === '') { re.lastIndex++; continue; }
    var s = m.index, e = s + m[0].length;
    if ((p.iso && !isolated(text, s, e)) || (p.check && !p.check(m[0], text, s, hint))) { re.lastIndex = s + 1; continue; }
    out.push({s:s, e:e, m:m[0]});
  }
  re.lastIndex = 0;
  return out;
}

// ─── 레이어1: 직접 등록한 단어 ───
// 긴 것부터 묶어 한 번에 치환한다. 한 번에 처리해야 먼저 넣은 치환 코드 속 글자가 다른 단어로 다시 치환되지 않는다.
// 대소문자는 구분하지 않는다. 단어 속 공백은 공백·줄바꿈이 몇 칸이든(없어도) 맞춘다.
// 세 글자 이상인 토막은 글자 사이에 줄바꿈이 낀 것도 맞춘다("(주)가나다⏎산업": 좁은 칸에서 줄이 바뀐 경우).
// 세 글자 이상 한글 단어는 글자를 하나씩 띄어 쓴 것도 맞춘다("서 지 환").
//   아무 공백이나 허용하면 "김영수"가 "김 영수증"을 가리므로 이 두 모양만 허용한다.
// 영문·숫자로 시작하거나 끝나는 단어는 낱말 경계를 지킨다("Lee"가 "sleeve" 속을 가리지 않게). maskText에서 확인한다.
function escRe(ch) { return ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function wordPattern(orig) {
  var NL = '(?:[ \\t]*\\n[ \\t]*)?';
  var base = orig.trim().split(/\s+/).map(function(part){
    var ch = part.split('').map(escRe);
    return ch.length >= 3 ? ch.join(NL) : ch.join('');
  }).join('\\s*');
  var compact = orig.trim().replace(/\s+/g, '');
  if (compact.length >= 3 && /^[가-힣]+$/.test(compact)) base += '|' + compact.split('').join('[ \\t]+');
  return base;
}
function compileWords() {
  var list = words.filter(function(w){ return w.original && w.original.trim(); })
    .sort(function(a,b){ return b.original.length - a.original.length; });
  if (!list.length) return null;
  var src = list.map(function(w){ return '(' + wordPattern(w.original) + ')'; }).join('|');
  return {re:new RegExp(src,'gi'), list:list};
}

// ─── 레이어2: 패턴. 치환 코드에 번호를 붙인다: [사업자번호1], [사업자번호2] … ───
// 같은 값은 같은 번호, 다른 값은 다른 번호. 번호표(seq)는 문서 하나(엑셀은 모든 시트)에 하나를 쓴다.
// 사용자가 직접 적은 치환 코드와 겹치는 번호는 건너뛴다.
function newSeq() {
  var taken = Object.create(null);
  words.forEach(function(w){ taken[w.token] = true; });
  return {ids:Object.create(null), next:Object.create(null), taken:taken};
}
// 표기만 다른 같은 값을 하나로 본다: 123-45-67890 = 1234567890, +82-10-1234-5678 = 010-1234-5678
function normValue(p, raw) {
  if (p.norm === 'lower') return raw.replace(/\s/g, '').toLowerCase();
  var d = raw.replace(/\D/g, '');
  if (p.norm === 'phone' && /^\+?82/.test(raw)) { d = d.slice(2); if (d.charAt(0) !== '0') d = '0' + d; }
  return d;
}
function patToken(p, n) { return '[' + p.tok + n + ']'; }
function seqToken(seq, p, raw) {
  var key = p.id + '|' + normValue(p, raw);
  if (!(key in seq.ids)) {
    var n = (seq.next[p.id] || 0) + 1;
    while (seq.taken[patToken(p, n)]) n++;
    seq.ids[key] = seq.next[p.id] = n;
  }
  return patToken(p, seq.ids[key]);
}

// onHit(type, original, token): 치환이 실제로 일어날 때마다 한 번씩 부른다 (건수는 여기서만 센다)
// steps(배열)를 넘기면 치환 단계마다 바꾼 자리를 담아 준다: [{s:시작, e:끝, n:넣은 코드 길이}] (그 단계 직전 글 기준, 앞에서부터).
//   PDF 도구가 표의 칸 구분을 가린 뒤 제자리에 되돌릴 때 쓴다. normText는 글자 수를 바꾸지 않는다.
function maskText(text, wm, onHit, seq, hint, steps) {
  if (!seq) seq = newSeq();
  var out = normText(text);
  var active = PATTERNS.filter(function(p){ return patSt[p.id]; });
  if (wm) {
    // 패턴이 통째로 가릴 자리(이메일·번호)의 일부만 등록 단어와 겹치면 단어 치환을 건너뛴다.
    // 건너뛰지 않으면 "kim" 등록 → "kim@company.com"이 "[담당자A]@company.com"이 되어 이메일이 남는다.
    var spans = [], ed = [];
    active.forEach(function(p){ spans = spans.concat(findPattern(out, p, hint)); });
    out = out.replace(wm.re, function(m){
      var off = arguments[arguments.length-2], str = arguments[arguments.length-1];
      // 영문·숫자 단어는 앞뒤에 영문·숫자가 붙어 있으면(더 긴 낱말의 일부이면) 건너뛴다
      if (/^[A-Za-z0-9]/.test(m) && /[A-Za-z0-9]/.test(str.charAt(off-1))) return m;
      if (/[A-Za-z0-9]$/.test(m) && /[A-Za-z0-9]/.test(str.charAt(off + m.length))) return m;
      for (var k=0;k<spans.length;k++) {
        if (spans[k].s <= off && off + m.length <= spans[k].e && spans[k].e - spans[k].s > m.length) return m;
      }
      for (var i=0;i<wm.list.length;i++) {
        if (arguments[i+1] !== undefined) {
          onHit('user', wm.list[i].original, wm.list[i].token);
          ed.push({s:off, e:off + m.length, n:wm.list[i].token.length});
          return wm.list[i].token;
        }
      }
      return m;
    });
    if (steps) steps.push(ed);
  }
  active.forEach(function(p){ out = replacePattern(out, p, onHit, seq, hint, steps); });
  return out;
}
function replacePattern(text, p, onHit, seq, hint, steps) {
  var found = findPattern(text, p, hint);
  if (!found.length) return text;
  var out = '', last = 0, ed = [];
  found.forEach(function(f){
    var tok = seqToken(seq, p, f.m);
    out += text.slice(last, f.s) + tok;
    last = f.e;
    ed.push({s:f.s, e:f.e, n:tok.length});
    onHit('pattern', f.m.replace(/\s+/g, ' '), tok);
  });
  if (steps) steps.push(ed);
  return out + text.slice(last);
}

// ─── 남은 것 점검: 가린 뒤에도 남아 있는 긴 숫자 ───
// 쉼표·공백 없이 이어진 숫자(하이픈·점은 허용)가 minDigits자리 이상이면 계좌·번호일 수 있다.
// 공백으로 띄운 것은 표의 숫자와 구분이 안 되므로 카드(4-4-4-4)와 끝 묶음이 긴 계좌 모양만 본다.
// 가려진 것은 치환 코드가 되어 숫자가 없으므로 여기에 걸리지 않는다.
function findResidue(maskedText, minDigits) {
  var out = [], m;
  var res = [/\d(?:[-.]?\d){8,}/g, /\d{4} \d{4} \d{4} \d{4}|\d{2,6} \d{2,6} \d{6,8}/g];
  res.forEach(function(re, k){
    while ((m = re.exec(maskedText)) !== null) {
      if (k === 0 && (m[0].replace(/\D/g, '').length < (minDigits || 9) || isDocNo(m[0]))) continue;
      if (k === 1 && !isolated(maskedText, m.index, m.index + m[0].length)) continue;
      if (out.indexOf(m[0]) < 0) out.push(m[0]);
    }
  });
  return out;
}

// ─── 치환 코드 번호 ───
// 0→A, 25→Z, 26→AA … (엑셀 열 이름과 같은 방식)
function seqLetters(n) {
  var s=''; n++;
  while(n>0){ n--; s=ALPHA[n%26]+s; n=Math.floor(n/26); }
  return s;
}
function seqIndex(s) {
  var n=0;
  for (var i=0;i<s.length;i++) n = n*26 + ALPHA.indexOf(s[i]) + 1;
  return n-1;
}
// [회사A] … [회사Z] 다음은 [회사AA]. 같은 코드가 두 단어에 붙지 않게 한다
function nextToken(label) {
  var pre = '['+label, max = -1;
  words.forEach(function(w){
    var t = w.token;
    if (t.indexOf(pre)!==0 || t.charAt(t.length-1)!==']') return;
    var mid = t.slice(pre.length, -1);
    if (/^[A-Z]+$/.test(mid)) max = Math.max(max, seqIndex(mid));
  });
  return pre + seqLetters(max+1) + ']';
}

function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
