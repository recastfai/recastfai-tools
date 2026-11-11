// 마스킹 도구 빌드: tools-src/의 원본을 합쳐 apps/의 단일 파일 두 개를 만든다.
//   빌드:  node tools-src/build.mjs
//   확인:  node tools-src/build.mjs --check    (apps/가 지금 원본으로 빌드한 결과와 같은지만 본다. 다르면 종료코드 1)
// 배포되는 apps/*.html은 이 스크립트의 출력물이다. 직접 고치지 말고 tools-src/의 원본을 고친 뒤 다시 돌린다.
// 고치는 순서는 tools-src/README.md 에 있다.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = dirname(fileURLToPath(import.meta.url));
const VENDOR = join(SRC, 'vendor');
const OUT = join(SRC, '..', 'apps');
const PAGES = ['excel-masking.html', 'pdf-masking.html'];
const CHECK = process.argv.includes('--check');

const checksums = JSON.parse(readFileSync(join(VENDOR, 'checksums.json'), 'utf8')).sha384;
const VER = JSON.parse(readFileSync(join(SRC, 'version.json'), 'utf8'));
const read = (rel) => readFileSync(join(SRC, rel), 'utf8');

// 바깥에서 받은 파일(라이브러리·글꼴·글자표)은 기록해 둔 해시와 다르면 빌드를 멈춘다
function vendor(rel) {
  const buf = readFileSync(join(VENDOR, rel));
  const got = 'sha384-' + createHash('sha384').update(buf).digest('base64');
  if (!checksums[rel]) throw new Error(`checksums.json에 없는 파일: ${rel}`);
  if (checksums[rel] !== got) throw new Error(`해시 불일치: ${rel}\n  기록 ${checksums[rel]}\n  실제 ${got}`);
  return buf;
}

// <script> 안에 넣어도 HTML 파서가 오해하지 않게 한다. 자바스크립트 뜻은 그대로다.
function safeForScript(text, name) {
  if (/<\/script/i.test(text)) throw new Error(`${name}: </script 문자열이 들어 있어 그대로 넣을 수 없다`);
  return text.replace(/<!--/g, '<\\!--');
}
const lib = (name) => `<script>/* ${name} */\n${safeForScript(vendor(name).toString('utf8'), name)}\n</script>`;
const js  = (name) => `<script>\n${safeForScript(read(name), name)}</script>`;

// 실행하지 않고 글자로만 담는다 (pdf.js 워커 코드: 실행할 때 blob 주소로 만들어 쓴다)
function text(id, name) {
  const body = vendor(name).toString('utf8');
  if (/<\/script/i.test(body) || /<!--/.test(body)) throw new Error(`${name}: 글자로 담을 수 없는 문자열이 있다`);
  return `<script type="text/plain" id="${id}">${body}</script>`;
}

// 한국어 글자표(.bcmap)를 base64로 묶는다
function cmaps(id) {
  const map = {};
  for (const f of readdirSync(join(VENDOR, 'cmaps')).sort()) {
    if (f.endsWith('.bcmap')) map[f.slice(0, -6)] = vendor('cmaps/' + f).toString('base64');
  }
  return `<script type="application/json" id="${id}">${JSON.stringify(map)}</script>`;
}

// 공통 스타일: tool.css를 넣고, 제목용 글꼴(부분집합)을 data 주소로 넣는다
function css(name) {
  const font = vendor('fonts/NotoSerifKR-subset.woff2').toString('base64');
  let body = read(name);
  if (!body.includes('/* @font */')) throw new Error(`${name}: 글꼴 자리 표시가 없다`);
  body = body.replace('/* @font */', `data:font/woff2;base64,${font}`);
  if (/<\/style/i.test(body)) throw new Error(`${name}: </style 문자열이 있다`);
  return `<style>\n${body}</style>`;
}

// 화면에 나오는 한글이 글꼴 부분집합에 다 들어 있는지 본다 (빠지면 그 글자만 다른 글꼴로 보인다)
function checkGlyphs(page, html) {
  const have = new Set(readFileSync(join(VENDOR, 'fonts', 'glyphs.txt'), 'utf8'));
  // 주석은 화면에 나오지 않으므로 빼고 본다
  const shown = html.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
  const missing = [...new Set(shown.match(/[가-힣]/g) || [])].filter(ch => !have.has(ch));
  if (missing.length) throw new Error(`${page}: 글꼴에 없는 글자 ${missing.join('')}\n  → python3 tools-src/make_font.py <NotoSerifKR[wght].ttf> 를 돌린 뒤 다시 빌드한다 (README 참고)`);
}

function licenses(page) {
  const parts = [
    '이 파일에 함께 담긴 프로그램과 라이선스',
    '- SheetJS Community Edition 0.20.3 (xlsx.full.min.js) — Apache License 2.0, (C) SheetJS',
  ];
  if (page.startsWith('pdf')) {
    parts.push('- PDF.js 3.11.174 (pdf.min.js, pdf.worker.min.js) — Apache License 2.0, (C) Mozilla Foundation');
    parts.push('- Adobe CMap 자료 (한국어 글자표) — BSD 3-Clause, (C) Adobe Systems Incorporated');
  }
  parts.push('- Noto Serif KR 부분집합 (제목용 글꼴) — SIL Open Font License 1.1, (C) Google / Adobe');
  parts.push('- 그림: Books and Scholarly Accoutrements, Korea, 19th century — The Metropolitan Museum of Art, Public Domain');
  parts.push('', '===== Apache License 2.0 =====', vendor('LICENSE-Apache-2.0.txt').toString('utf8'));
  parts.push('===== SIL Open Font License 1.1 (Noto Serif KR) =====', vendor('fonts/OFL.txt').toString('utf8'));
  if (page.startsWith('pdf')) parts.push('===== Adobe CMap LICENSE =====', vendor('cmaps/LICENSE').toString('utf8'));
  const body = parts.join('\n');
  if (/<\/script/i.test(body)) throw new Error('라이선스 글에 </script 문자열이 있다');
  return `<script type="text/plain" id="third-party-licenses">\n${body}\n</script>`;
}

function build(page) {
  let html = read(page);

  // 1) 페이지 변수와 공통 조각
  const m = html.match(/<!-- @vars (\{.*\}) -->\n/);
  if (!m) throw new Error(`${page}: @vars 줄이 없다`);
  const vars = { ...JSON.parse(m[1]), version: VER.version, date: VER.date };
  html = html.replace(m[0], '');
  html = html.replace(/<!-- @part ([\w.-]+) -->\n/g, (_, name) => read(join('parts', name)));
  html = html.replace(/\{\{(\w+)\}\}/g, (all, key) => {
    if (!(key in vars)) throw new Error(`${page}: 변수 {{${key}}} 의 값이 없다`);
    return vars[key];
  });

  // 2) 우리 코드까지 넣은 상태에서 검사한다 (라이브러리를 넣기 전)
  let own = html.replace(/<!-- @js ([\w.-]+) -->/g, (_, name) => js(name));
  checkGlyphs(page, own);   // tool.css의 한글은 주석뿐이라 보지 않는다
  const code = own.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');   // 주석을 뺀 코드
  if (page.startsWith('pdf') && !/getDocument\(\{[^}]*isEvalSupported:\s*false/.test(code)) {
    throw new Error('pdf: getDocument의 isEvalSupported:false 가 없다 (CVE-2024-4367 방어선). 지우면 안 된다');
  }
  const csp = (own.match(/http-equiv="Content-Security-Policy" content="([^"]*)"/) || [])[1] || '';
  if (!/default-src 'none'/.test(csp) || !/connect-src 'none'/.test(csp)) throw new Error(`${page}: 외부 연결 차단(CSP) 줄이 없거나 약해졌다`);
  if (/unsafe-eval|https?:|\*/.test(csp)) throw new Error(`${page}: CSP에 unsafe-eval·외부 주소·* 를 넣으면 안 된다`);
  if (/(?:src|href)=["']https?:\/\/[^"']+\.(?:js|css|woff2?)["']/i.test(own)) {
    throw new Error(`${page}: 외부 스크립트·스타일·글꼴 주소가 들어 있다`);
  }

  // 3) 라이브러리·글꼴·그림을 넣는다
  html = own;
  html = html.replace(/@@IMG:([\w.-]+)@@/g, (_, name) => 'data:image/jpeg;base64,' + readFileSync(join(SRC, 'img', name)).toString('base64'));
  html = html.replace(/<!-- @(lib|text|cmaps|licenses|css)(?: ([\w.-]+))?(?: ([\w.-]+))? -->/g, (_, kind, a, b) => {
    if (kind === 'css') return css(a);
    if (kind === 'lib') return lib(a);
    if (kind === 'text') return text(a, b);
    if (kind === 'cmaps') return cmaps(a);
    return licenses(page);
  });
  if (/<!--\s*@|@@IMG:|\{\{\w+\}\}/.test(html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, ''))) throw new Error(`${page}: 처리하지 못한 자리 표시가 남았다 (자리 표시는 <!-- @종류 이름 --> 모양 그대로 써야 한다)`);
  return html.replace('<!DOCTYPE html>',
    `<!DOCTYPE html>\n<!-- 마스킹 도구 v${VER.version} (${VER.date}). 이 파일은 tools-src/build.mjs가 만든 것이다. 고칠 때는 tools-src/의 원본을 고치고 다시 빌드한다. -->`);
}

// 두 파일을 다 만든 뒤에 쓴다 (하나가 실패하면 아무것도 바꾸지 않는다)
const outputs = PAGES.map(page => [page, build(page)]);
let stale = false;
for (const [page, html] of outputs) {
  if (CHECK) {
    let cur = null;
    try { cur = readFileSync(join(OUT, page), 'utf8'); } catch {}
    const same = cur === html;
    if (!same) stale = true;
    console.log(`${page}: ${same ? 'apps/와 같음' : 'apps/가 원본과 다름 → node tools-src/build.mjs 를 돌려야 한다'}`);
  } else {
    writeFileSync(join(OUT, page), html);
    console.log(`${page}: ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB (v${VER.version})`);
  }
}
if (stale) process.exit(1);
