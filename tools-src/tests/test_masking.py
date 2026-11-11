# 마스킹 도구 브라우저 테스트 (Playwright + Chromium)
#   실행: python3 tools-src/tests/test_masking.py            ← apps/ 의 빌드 결과를 file:// 로 연다
#         python3 tools-src/tests/test_masking.py http://127.0.0.1:8765   ← 웹 서버로 띄운 주소 (단어 보관 기능까지 본다)
#   준비: pip install -r tools-src/tests/requirements.txt && playwright install chromium
# 먼저 apps/가 지금 원본으로 빌드한 것과 같은지 확인한다(다르면 바로 실패). 실패가 하나라도 있으면 종료코드 1.
import sys, os, json, time, subprocess, tempfile, datetime
from playwright.sync_api import sync_playwright
from openpyxl import Workbook, load_workbook

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
d = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'apps')
HTTP = d.startswith('http')
U = d if HTTP else 'file://' + d
FX = os.path.join(HERE, 'fixtures')
TMP = tempfile.mkdtemp()

fails = []; passed = 0
def check(name, got, want):
    global passed
    ok = got == want
    print(('PASS ' if ok else 'FAIL ') + name + ('' if ok else f"\n     got : {json.dumps(got, ensure_ascii=False)}\n     want: {json.dumps(want, ensure_ascii=False)}"))
    if ok: passed += 1
    else: fails.append(name)

# ── 0. apps/가 원본과 같은가 (원본만 고치고 빌드를 빼먹었거나 apps/를 직접 고친 경우를 잡는다)
r = subprocess.run(['node', os.path.join(ROOT, 'tools-src', 'build.mjs'), '--check'], capture_output=True, text=True)
check('0 apps/ matches a fresh build', [r.returncode, r.stdout.count('apps/와 같음')], [0, 2])

# ── 큰 파일·특수 파일은 돌릴 때 만든다 (저장소에 두지 않는다)
if not os.path.exists(FX + '/big.xlsx'):
    wb = Workbook(); ws = wb.active
    ws.append(['거래처','사업자번호','연락처','금액','적요','a','b','c'])
    for i in range(20000):
        ws.append([f'거래처{i%300}', f'{100+i%900}-{10+i%90}-{10000+i%90000}', f'010-{1000+i%9000}-{1000+i%9000}', i*1000, '외상매출금 회수 (주)가나다산업', i, '메모', 'x'])
    wb.save(FX + '/big.xlsx')
wb = Workbook(); ws = wb.active; ws.title = '(주)가람정밀'
ws.append(['거래처', '사업자번호', '계좌', '일자', '금액', '메모'])
ws.append(['(주)가람정밀', 1248100998, 1002350123456, datetime.date(2026, 10, 15), 33000000, '서 지 환 대표'])
ws.append(['주식회사 가람정밀', '124-81-00998', '301-0123-4567-81', datetime.date(2026, 10, 16), 5500000, '담당 kim@garam.co.kr'])
ws.append(['누리온상사', '120-86-34567', '', None, 1200000000, '전표 2026-10-000123'])
h = wb.create_sheet('거래처마스터'); h.sheet_state = 'hidden'
h.append(['상호', '대표']); h.append(['가람정밀', '서지환'])
far = wb.create_sheet('먼셀'); far['A1'] = '시작'; far['Z300000'] = '010-1234-5678'
wb.save(TMP + '/special.xlsx')
open(TMP + '/fake.xls', 'wb').write('거래처\t금액\n(주)가나다산업\t1000\n'.encode('euc-kr'))

ENGINE = [  # (설명, 입력, 기대 결과) — 기본 설정(패턴 전부 켜짐, 등록 단어 없음)
 ('phone formats', '010-1234-5678 / 02-123-4567 / TEL010-1234-5678 / 0507-1234-5678', '[연락처1] / [연락처2] / TEL[연락처1] / [연락처3]'),
 ('phone +82 = same number', '+82-10-1234-5678 / 010 1234 5678 / 82-10-1234-5678', '[연락처1] / [연락처1] / [연락처1]'),
 ('phone dotted, glued, paren', '010.4821.7733 / 01048217240 / 02)2109-4567', '[연락처1] / [연락처2] / [연락처3]'),
 ('phone after amount', '합계 1,500 010-1234-5678 / 매출 35,000,000 010-1234-5678', '합계 1,500 [연락처1] / 매출 35,000,000 [연락처1]'),
 ('accounts and cards', '우리 1002-123-456789 / 농협 301-0123-4567-81 / 카드 8212-3456-7890-1234', '우리 [계좌번호1] / 농협 [계좌번호2] / 카드 [계좌번호3]'),
 ('split by line break', '123-45-\n67890 / 010-1234-\n5678 / 800101-\n1234567', '[사업자번호1] / [연락처1] / [등록번호1]'),
 ('email incl. line break', 'hong@ganada.\nco.kr 입니다. a@b.com.\nand then', '[이메일1] 입니다. [이메일2].\nand then'),
 ('odd hyphens, fullwidth digits', '123‑45‑67890 / 010–1234–5678 / １２３-４５-６７８９０', '[사업자번호1] / [연락처1] / [사업자번호1]'),
 ('glued to letters', 'Tax ID123-45-67890 / RRN800101-1234567 / A/C110-123-456789', 'Tax ID[사업자번호1] / RRN[등록번호1] / A/C[계좌번호1]'),
 ('bizno without hyphen needs a cue', '사업자번호 1058690123\n금액 2148751234 원 / 124 81 00998 / 120 15 18000', '사업자번호 [사업자번호1]\n금액 2148751234 원 / [사업자번호2] / 120 15 18000'),
 ('registration numbers', '8805121234567 / 110114-0234567 / 900101-5234567 / 1002350123456', '[등록번호1] / [등록번호2] / [등록번호3] / 1002350123456'),
 ('not numbers to hide', '전표 2026-10-000123 / 2026-10-15 / 116,200,000 / 100 200 3000 4000', '전표 2026-10-000123 / 2026-10-15 / 116,200,000 / 100 200 3000 4000'),
 ('passport', '여권 M48291735 / M123A4567 / AM12345678', '여권 [여권번호1] / [여권번호2] / AM12345678'),
 ('longer hyphenated number is one account', '1234-123-45-67890', '[계좌번호1]'),
 ('spaced hyphens, hyphen on next line', 'Tel : 010 - 4821 - 7733 / 02 - 2109 - 4567 / 02-2109\n-4567', 'Tel : [연락처1] / [연락처2] / [연락처2]'),
 ('email with digits in the id is one email', 'kim01048217733@garam.example / tax214-87-51234@x.co.kr', '[이메일1] / [이메일2]'),
 ('email wrapped mid-domain', 'dykim@garam-\nprecision.example / hong@naver.\ncom 입니다', '[이메일1] / [이메일2] 입니다'),
 ('web address, overseas phone', 'www.garam-precision.co.kr / https://a.b.com/x?y=1 끝 / +1 415 555 0100', '[웹주소1] / [웹주소2] 끝 / [연락처1]'),
 ('spaced resident number, long-tail and two-part accounts', '880512 1234567 / 3333-01-2345678 / 123456-12345678 / 2012-01-1234567', '[등록번호1] / [계좌번호1] / [계좌번호2] / [계좌번호3]'),
 ('table numbers are left alone', '1200 4500 1320 5500 / 버전 1.2.3 / 3.14.159 / 8055-1234', '1200 4500 1320 5500 / 버전 1.2.3 / 3.14.159 / 8055-1234'),
 ('same value same code', '123-45-67890 / 234-56-78901 / 123-45-67890', '[사업자번호1] / [사업자번호2] / [사업자번호1]'),
]
M = "(t)=>{let h=0; const o=maskText(t, compileWords(), ()=>h++); return [o,h]}"

with sync_playwright() as p:
    b = p.chromium.launch()

    # ── 1. 엔진·단어·보관 (두 도구 모두)
    for tool in ('excel', 'pdf'):
        T = tool[0].upper() + '1 '
        ctx1 = b.new_context(); pg = ctx1.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(f'{U}/{tool}-masking.html')
        m = lambda t: pg.evaluate(M, t)
        for name, inp, want in ENGINE: check(T + name, m(inp)[0], want)
        pg.evaluate("PATTERNS.forEach(p=>patSt[p.id]=false)")
        check(T + 'all patterns off', m('123-45-67890 010-1234-5678 a@b.kr')[0], '123-45-67890 010-1234-5678 a@b.kr')
        pg.evaluate("PATTERNS.forEach(p=>patSt[p.id]=true)")
        pg.evaluate("words=[{original:'kim',token:'[담당자A]',id:1},{original:'ganada',token:'[회사A]',id:2},{original:'서지환',token:'[대표자A]',id:3},{original:'(주)가나다산업',token:'[회사B]',id:4},{original:'가나다산업',token:'[회사C]',id:5},{original:'02-1234-5678',token:'[연락처A]',id:6},{original:'회사',token:'[기타A]',id:7},{original:'a+b(c)',token:'$&[$1]',id:8},{original:'x9',token:'[사업자번호1]',id:9}]")
        check(T + 'word inside an email is left to the pattern', m('kim@company.com / hong@ganada.co.kr / kim 과장'), ['[이메일1] / [이메일2] / [담당자A] 과장', 3])
        check(T + 'spaced or wrapped word', m('서 지 환 / 서\n지환 / (주)가나다\n산업 / (주) 가나다산업'), ['[대표자A] / [대표자A] / [회사B] / (주) [회사C]', 4])
        pg.evaluate("window._w = words; words=[{original:'Lee',token:'[A]',id:1},{original:'San',token:'[B]',id:2},{original:'김영수',token:'[C]',id:3}]")
        check(T + 'short words do not eat ordinary text', m('single entry sale etc / Mr. Lee / this analysis / sleeve / 김 영수증 / 김영수 과장')[0], 'single entry sale etc / Mr. [A] / this analysis / sleeve / 김 영수증 / [C] 과장')
        pg.evaluate("words = window._w")
        check(T + 'longest first, token not re-masked', m('(주)가나다산업 회사소개, 가나다산업'), ['[회사B] [기타A]소개, [회사C]', 3])
        check(T + 'regex chars and $ in token', m('x a+b(c) y'), ['x $&[$1] y', 1])
        check(T + 'registered number beats pattern', m('02-1234-5678 / 02-9999-8888'), ['[연락처A] / [연락처1]', 2])
        check(T + 'pattern number skips a code the user took', m('123-45-67890 234-56-78901')[0], '[사업자번호2] [사업자번호3]')
        check(T + 'residue finder', pg.evaluate("[findResidue('금액 116,200,000 계좌 1002350123456 / 301.0123.4567 / 12345678 / 5412 7500 1234 5678 / 110 345 678901 / 100 200 3000', 9), findResidue('116200000', 10)]"), [['1002350123456', '301.0123.4567', '5412 7500 1234 5678', '110 345 678901'], []])
        pg.evaluate("words=[]; for(let i=0;i<30;i++) words.push({original:'w'+i, token:nextToken('회사'), id:i});")
        check(T + 'word codes unique past Z', pg.evaluate("[words[25].token, words[26].token, new Set(words.map(w=>w.token)).size]"), ['[회사Z]', '[회사AA]', 30])
        check(T + 'esc', pg.evaluate("esc(`a\"b'c<d>&`)"), 'a&quot;b&#39;c&lt;d&gt;&amp;')
        check(T + 'stored words are sanitized', pg.evaluate("[cleanWords([{original:'a',token:'[x]',id:'1);alert(1'},{foo:1},null,{original:'b',token:'[y]',id:7}]), cleanWords(null), cleanWords('x')]"), [[{'original': 'a', 'token': '[x]', 'id': 1}, {'original': 'b', 'token': '[y]', 'id': 7}], [], []])
        pg.evaluate("words=[]; renderWords()")
        pg.fill('#inp-orig', '윤세라, 남궁 민서; 이산'); pg.click('button.btn.wide')
        check(T + 'bulk add, nothing written to storage by default', pg.evaluate("[words.map(w=>w.original+w.token), sessionStorage.getItem(LS_KEY), localStorage.getItem(LS_KEY)]"), [['윤세라[회사A]', '남궁 민서[회사B]', '이산[회사C]'], None, None])
        pg.fill('#inp-orig', '가, 홍길동'); pg.click('button.btn.wide')
        check(T + 'one-letter word is refused', pg.evaluate("[words.length, document.getElementById('main-err').textContent.includes('한 글자')]"), [3, True])
        pg.fill('#inp-orig', 'ABC Co., Ltd.'); pg.click('button.btn.wide')
        check(T + 'comma inside a company name is not a separator', pg.evaluate("words[3].original"), 'ABC Co., Ltd.')
        pg.evaluate("removeWord(words[3].id)")
        pg.fill('#inp-orig', '윤세라'); pg.press('#inp-orig', 'Enter')
        check(T + 'duplicate shows an error', pg.evaluate("[document.getElementById('main-err').textContent.includes('이미 등록'), getComputedStyle(document.getElementById('main-err')).display]"), [True, 'block'])
        pg.evaluate("togglePersist()")
        if HTTP:
            check(T + 'keep on writes to localStorage', pg.evaluate("[isPersist, localStorage.getItem(PERSIST_KEY), JSON.parse(localStorage.getItem(LS_KEY)).length, document.getElementById('persist-toggle').getAttribute('aria-pressed')]"), [True, '1', 3, 'true'])
            pg.reload(); check(T + 'kept words come back after reload', pg.evaluate("words.length"), 3)
            pg.evaluate("togglePersist()"); check(T + 'keep off removes the stored list', pg.evaluate("[isPersist, localStorage.getItem(PERSIST_KEY), localStorage.getItem(LS_KEY)]"), [False, '0', None])
            pg.reload(); check(T + 'nothing comes back when not kept', pg.evaluate("words.length"), 0)
            # 두 탭에서 보관을 켠 뒤 한쪽에서 끄면, 다른 탭이 단어를 추가해도 목록이 다시 저장되지 않는다
            pg.evaluate("togglePersist()"); pgB = ctx1.new_page(); pgB.goto(f'{U}/{tool}-masking.html')
            pg.evaluate("togglePersist()"); pgB.fill('#inp-orig', '두번째탭'); pgB.click('button.btn.wide')
            check(T + 'turning keep off in one tab holds for the other', [pg.evaluate("localStorage.getItem(LS_KEY)"), pgB.evaluate("isPersist")], [None, False])
            pgB.close()
            pg.fill('#inp-orig', 'a1, b2, c3'); pg.click('button.btn.wide')
        else:
            check(T + 'keeping is refused on a downloaded file', pg.evaluate("[isPersist, localStorage.getItem(LS_KEY), document.getElementById('persist-desc').textContent.includes('켤 수 없습니다')]"), [False, None, True])
        pg.evaluate("confirmClearWords()"); pg.keyboard.press('Escape')
        check(T + 'Esc closes the dialog and keeps words', pg.evaluate("[document.getElementById('confirm-modal').style.display, words.length]"), ['none', 3])
        pg.evaluate("confirmClearWords()"); pg.click('#modal-ok-btn'); check(T + 'clear all', pg.evaluate("words.length"), 0)
        pg.focus('#drop-zone'); check(T + 'upload box is reachable by keyboard', pg.evaluate("document.activeElement.id"), 'drop-zone')
        check(T + 'no page errors', errs, [])
        ctx1.close()

    # ── 2. Excel 흐름
    ctx = b.new_context(accept_downloads=True); pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(f'{U}/excel-masking.html')
    pg.set_input_files('#file-input', FX + '/t.xlsx')
    pg.wait_for_selector('#fml-modal', state='visible'); pg.keyboard.press('Escape')
    check('X formula dialog closes with Esc', pg.evaluate("[document.getElementById('fml-modal').style.display, sheets.length]"), ['none', 0])
    pg.set_input_files('#file-input', FX + '/t.xlsx')   # 같은 파일 다시
    pg.wait_for_selector('#fml-modal', state='visible', timeout=8000); pg.click('#fml-ok-btn')
    check('X opens on the masked tab', pg.evaluate("[curTab, getComputedStyle(document.getElementById('grid-mask')).display, document.getElementById('grid-orig').innerHTML]"), ['mask', 'block', ''])
    check('X dates ISO, formula value', pg.evaluate("[sheets[0].origRows[1][3], sheets[0].origRows[2][3], sheets[0].origRows[3][3], sheets[0].origRows[4][4]]"), ['2024-01-05', '2024-12-31', '2025년 3월 1일', '218,000,000'])
    check('X row 3 masked', pg.evaluate("sheets[0].maskRows[2].map(c=>c.v)"), ['가나다산업', '[사업자번호2]', '[연락처2]', '2024-12-31', '89300000', '[계좌번호2]', 'abc corp 재확인'])
    check('X summary, unmasked sheet name is flagged', pg.evaluate("[document.getElementById('stat-tok').textContent, document.getElementById('audit-count').textContent, auditList.every(a=>a.count===1), residueList.map(r=>r.value+' @ '+r.where)]"), ['9건 가림', '9종 · 9건', True, ['가나다산업_원장 @ 시트 이름']])
    pg.fill('#inp-orig', 'ABC Corp, 가나다산업, 홍길동'); pg.click('button.btn.wide')
    check('X words applied on all sheets, per-match mapping', pg.evaluate("auditList.filter(a=>a.type==='user').map(a=>[a.original,a.token,a.count]).sort()"), [['ABC Corp', '[회사A]', 2], ['가나다산업', '[회사B]', 5], ['홍길동', '[회사C]', 2]])
    check('X sheet names masked in the masked tab', pg.evaluate("[sheets.map(s=>s.maskName), [...document.querySelectorAll('#sheet-tabs-mask .sheet-tab')].map(b=>b.textContent)]"), [['(회사B)_원장', '시트2', '시트3'], ['(회사B)_원장', '시트2', '시트3']])
    pg.evaluate("renderGrids(2)"); pg.evaluate("togglePat('phone')")
    check('X stays on sheet 3, pattern-off badge', pg.evaluate("[curSheet, document.getElementById('stat-off').textContent, sheets[0].maskRows[1][2].v]"), [2, '꺼짐: 전화번호', '02-1234-5678'])
    pg.evaluate("togglePat('phone'); renderGrids(0)")
    with pg.expect_download() as dl: pg.evaluate("dlMasked()")
    out = TMP + '/out.xlsx'; dl.value.save_as(out); wbk = load_workbook(out)
    r2 = [c.value for c in wbk.worksheets[0][2]]
    check('X saved file: masks, numbers stay numbers, dates stay dates', [wbk.sheetnames, r2[:3], type(r2[3]).__name__, r2[4], r2[5:], wbk.worksheets[0]['E5'].value, wbk.worksheets[2]['A2'].value],
          [['(회사B)_원장', '시트2', '시트3'], ['(주)[회사B]', '[사업자번호1]', '[연락처1]'], 'datetime', 116200000, ['[계좌번호1]', '[회사A] 담당'], 218000000, '[회사B]'])
    with pg.expect_download() as dl: pg.evaluate("dlAuditTxt()")
    txt = open(dl.value.path(), encoding='utf-8').read().splitlines()
    check('X mapping txt', [txt[0], txt[2][:9], txt[5][:12]], ['Recast Finance AI Excel 마스킹 v' + pg.evaluate('TOOL_VERSION') + ' — 치환 대응표', '치환 코드 12종', '001. [등록 단어]'])
    with pg.expect_download() as dl: pg.evaluate("dlAuditXlsx()")
    with pg.expect_download() as dl: pg.evaluate("exportPresetXlsx()")
    pg.evaluate("confirmFileReset()"); pg.click('#modal-ok-btn')
    check('X reset clears everything shown', pg.evaluate("[sheets.length, document.getElementById('grid-mask').innerHTML, document.getElementById('sheet-tabs-orig').innerHTML, document.getElementById('audit-tbody').innerHTML, document.getElementById('step-hint').style.display, getComputedStyle(document.getElementById('upload-area')).display]"), [0, '', '', '', 'none', 'block'])

    # 특수 파일: 숫자로 든 번호, 숨김 시트, 먼 셀, 표기 변형, 남은 숫자
    pg.evaluate("words=[]; renderWords()")
    t0 = time.time(); pg.set_input_files('#file-input', TMP + '/special.xlsx'); pg.wait_for_selector('#result-area', state='visible', timeout=30000); t1 = time.time()
    check('X sparse sheet opens fast', t1 - t0 < 10, True)
    check('X numeric id column masked by header, long number kept whole', pg.evaluate("[sheets[0].maskRows[1][1].v, sheets[0].origRows[1][2], sheets[0].maskRows[2][1].v, sheets[0].maskRows[2][2].v]"), ['[사업자번호1]', '1002350123456', '[사업자번호1]', '[계좌번호1]'])
    check('X residue lists what is left', pg.evaluate("[residueList.map(r=>r.value+' @ '+r.where), document.getElementById('stat-res').textContent, document.getElementById('step-hint').className]"), [['(주)가람정밀 @ 시트 이름', '1002350123456 @ (주)가람정밀 C2', '1200000000 @ (주)가람정밀 E4', '거래처마스터 @ 시트 이름', '먼셀 @ 시트 이름'], '확인 필요 5건', 'step-hint warn'])
    pg.click('#residue-box .btn-sm >> nth=1')
    check('X one click hides a leftover number', pg.evaluate("[sheets[0].maskRows[1][2].v, residueList.length]"), ['[기타A]', 4])
    check('X hidden sheet is labelled, far cell found', pg.evaluate("[sheets.map(s=>s.hidden), document.querySelector('#sheet-tabs-mask .sheet-tab:nth-child(2)').textContent, sheets[2].maskRows.length, sheets[2].maskRows[299999][25].v]"), [[False, True, False], '거래처마스터 숨김 시트', 300000, '[연락처1]'])
    pg.fill('#inp-orig', '가람정밀, 서지환'); pg.click('button.btn.wide')
    check('X name variants caught by core word', pg.evaluate("[sheets.map(s=>s.maskName)[0], sheets[0].maskRows[1][0].v, sheets[0].maskRows[2][0].v, sheets[0].maskRows[1][5].v, sheets[1].maskRows[1].map(c=>c.v)]"), ['(주)(회사A)', '(주)[회사A]', '주식회사 [회사A]', '[회사B] 대표', ['[회사A]', '[회사B]']])
    pg.evaluate("renderGrids(2)")
    check('X preview is capped with a note', pg.evaluate("[document.querySelectorAll('#grid-mask tbody tr').length, document.getElementById('preview-note').textContent.includes('300000행')]"), [500, True])
    with pg.expect_download() as dl: pg.evaluate("dlMasked()")
    out = TMP + '/out2.xlsx'; dl.value.save_as(out); wbk = load_workbook(out)
    check('X saved special file', [wbk.sheetnames, wbk.worksheets[0]['E2'].value, wbk.worksheets[0]['C2'].value, wbk.worksheets[2]['Z300000'].value, wbk.worksheets[1].sheet_state],
          [['(주)(회사A)', '거래처마스터', '먼셀'], 33000000, '[기타A]', '[연락처1]', 'visible'])
    pg.evaluate("doReset()"); pg.set_input_files('#file-input', TMP + '/fake.xls'); pg.wait_for_timeout(600)
    check('X text file named .xls is refused', pg.evaluate("[document.getElementById('main-err').textContent.includes('글자 파일'), sheets.length]"), [True, 0])
    pg.evaluate("words=[]; renderWords(); loadSample()")
    check('X sample', pg.evaluate("[document.getElementById('stat-tok').textContent, sheets[0].maskRows[1].map(c=>c.v)]"), ['8건 가림', ['(주)가나다산업', '[사업자번호1]', '홍길동', '[연락처1]', '116200000', '주요고객']])
    check('X no page errors', errs, [])
    pg2 = ctx.new_page(); pg2.goto(f'{U}/excel-masking.html')
    pg2.evaluate("words=[]; for(let i=0;i<50;i++) words.push({original:'거래처'+(i*6), token:'[회사'+i+']', id:i});")
    t0 = time.time(); pg2.set_input_files('#file-input', FX + '/big.xlsx'); pg2.wait_for_selector('#result-area', state='visible', timeout=180000); t1 = time.time()
    rt = pg2.evaluate("(()=>{const t=performance.now(); refresh(); return performance.now()-t})()")
    print('INFO big 20k rows: open s / refresh ms / td count:', [round(t1 - t0, 1), round(rt), pg2.evaluate("document.querySelectorAll('td').length")])
    check('X big file refresh under 3s', rt < 3000, True)
    ctx.close()

    # ── 3. PDF 흐름
    ctx = b.new_context(accept_downloads=True); pg = ctx.new_page(); errs = []; cons = []
    pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: cons.append(m.text))
    pg.goto(f'{U}/pdf-masking.html')
    pg.evaluate("words=[{original:'(주)가나다산업',token:'[회사A]',id:1},{original:'가나다산업',token:'[회사B]',id:2},{original:'02-1234-5678',token:'[연락처A]',id:3},{original:'홍길동',token:'[대표자A]',id:4}]")
    pg.set_input_files('#file-input', FX + '/t.pdf'); pg.wait_for_selector('#result-area', state='visible', timeout=60000)
    check('P masked text', pg.evaluate("masked$"), "거래처 원장\n법인명: [회사A] 사업자등록번호: [사업자번호1]\n대표자: [대표자A] 연락처 [연락처A] / [연락처1]\n이메일: [이메일1] 계좌 [계좌번호1]\n거래처 사업자번호 금액\n마바사물산 [사업자번호2] 89,300,000\n아자차인쇄소 [사업자번호3] 12,500,000\n2쪽: [회사B] 미수금 확인. 담당 김세무 ([연락처2])\n")
    check('P counts match what is in the text', pg.evaluate("[auditList.reduce((s,x)=>s+x.count,0), (masked$.match(/\\[[^\\]]+\\]/g)||[]).length, document.getElementById('stat-tok').textContent, document.querySelectorAll('#tv-mask .code-chip').length]"), [11, 11, '11건 가림', 11])
    check('P each code maps to one value', pg.evaluate("(()=>{const m={}; auditList.forEach(a=>(m[a.token]=m[a.token]||new Set()).add(a.original)); return Object.values(m).every(s=>s.size===1)})()"), True)
    check('P opens on the masked tab with actions', pg.evaluate("[curTab, getComputedStyle(document.getElementById('tv-mask')).display, document.getElementById('pdf-actions').style.display, document.getElementById('ai-guide').style.display]"), ['mask', 'block', 'flex', 'block'])
    pg.click('#tab-orig'); pg.evaluate("(()=>{const t=document.getElementById('raw-ta'); t.value=''; t.oninput()})()")
    check('P cleared text leaves nothing stale', pg.evaluate("[masked$, auditList.length, document.getElementById('stat-tok').textContent, document.getElementById('audit-area').style.display]"), ['', 0, '가려진 항목 없음', 'none'])
    pg.evaluate("doReset()")
    check('P reset clears hidden text', pg.evaluate("[document.getElementById('raw-ta').value, document.getElementById('tv-mask').innerHTML, document.getElementById('drop-content').innerText.includes('드래그')]"), ['', '', True])
    pg.evaluate("words=[]")
    for name, want in [('A2_xobj_footer', '사업자등록번호 [사업자번호1]\n[연락처1] FAX [연락처2]\n'), ('B_2up', '법인명 (주)가나다산업\n사업자등록번호 [사업자번호1] [연락처1] 홍길동\n[이메일1]\n'),
                       ('A_xobj_right', '거래처 원장\n합계 1,234,500 [연락처1] 담당 김세무\n'), ('F_tight', '1,500 [연락처1]\n2,300 [연락처2]\n100 [연락처3]\n합계 4,500\n[연락처1] 담당자\n382\n[연락처4]\n'),
                       ('fp', None), ('rl', None)]:
        pg.set_input_files('#file-input', f'{FX}/{name}.pdf'); pg.wait_for_selector('#result-area', state='visible', timeout=60000)
        if want is not None: check('P fixture ' + name, pg.evaluate("masked$"), want)
        elif name == 'fp': check('P fixture fp (table rows)', pg.evaluate("masked$.split('\\n').slice(0,2)"), ['Vendor [사업자번호1] 116,200,000 [연락처1]', 'ABC Corp [사업자번호2] 89,300,000 [이메일1]'])
        else: check('P font-less Korean PDF read with bundled CMap', pg.evaluate("masked$.split('\\n')[1]"), '(주)가나다산업 [사업자번호1] 116,200,000 [연락처1]')
        pg.evaluate("doReset()")
    check('P real worker, no fallback', [c for c in cons if 'fake worker' in c.lower()], [])
    pg.fill('#direct-input', 'h'); check('P typing does not switch screens', pg.evaluate("inDoc"), False)
    pg.fill('#direct-input', '담당 010-2222-3333 계좌 1002350123456'); pg.click('text=이 글 가리기')
    check('P pasted text + residue', pg.evaluate("[masked$, residueList.map(r=>r.value)]"), ['담당 [연락처1] 계좌 1002350123456', ['1002350123456']])
    with pg.expect_download() as dl: pg.evaluate("dlAuditTxt()")
    with pg.expect_download() as dl: pg.evaluate("dlAuditXlsx()")
    with pg.expect_download() as dl: pg.evaluate("dlTxt()")
    check('P pageText (gap, backward, line change)', pg.evaluate("pageText([{str:'1002-123-456789',transform:[1,0,0,10,400,10],width:90,height:10},{str:'ABC',transform:[1,0,0,10,50,10],width:20,height:10},{str:'',hasEOL:true,transform:[1,0,0,1,0,0]},{str:'가',transform:[1,0,0,10,10,0],width:10,height:10},{str:'나',transform:[1,0,0,10,20,0],width:10,height:10},{str:' ',transform:[1,0,0,10,30,0],width:5,height:10},{str:'다',transform:[1,0,0,10,35,0],width:10,height:10,hasEOL:true}])"), '1002-123-456789 ABC\n가나 다\n')
    pg.evaluate("doReset(); loadSample()")
    check('P sample', pg.evaluate("[document.getElementById('stat-tok').textContent, masked$.includes('123-45-67890')]"), ['6건 가림', False])
    check('P no page errors', errs, [])
    ctx.close()

    # ── 4. 내장판: 외부 연결 0건, 인터넷 끊고 동작, CSP
    for tool in ('excel', 'pdf'):
        ctx = b.new_context(accept_downloads=True); reqs = []; cons = []; perr = []
        pg = ctx.new_page(); pg.on('request', lambda r: reqs.append(r.url)); pg.on('console', lambda m: cons.append(m.type + ': ' + m.text)); pg.on('pageerror', lambda e: perr.append(str(e)))
        if not HTTP: ctx.set_offline(True)
        pg.goto(f'{U}/{tool}-masking.html')
        if tool == 'excel':
            pg.set_input_files('#file-input', FX + '/t.xlsx'); pg.wait_for_selector('#fml-modal', state='visible', timeout=15000); pg.evaluate("confirmFml()")
            with pg.expect_download() as dl: pg.evaluate("dlMasked()")
            check('B excel works' + ('' if HTTP else ' offline'), [pg.evaluate("document.getElementById('stat-tok').textContent"), dl.value.suggested_filename[:7]], ['9건 가림', 'masked_'])
        else:
            pg.set_input_files('#file-input', FX + '/t.pdf'); pg.wait_for_selector('#result-area', state='visible', timeout=60000)
            check('B pdf works' + ('' if HTTP else ' offline'), pg.evaluate("[rawText.startsWith('거래처 원장'), document.getElementById('stat-tok').textContent]"), [True, '8건 가림'])
        check(f'B {tool}: no external requests', [u for u in reqs if not (u.startswith('blob:') or u.startswith('data:') or u.startswith(U))], [])
        r = pg.evaluate("""async () => { const v = []; document.addEventListener('securitypolicyviolation', e => v.push(e.effectiveDirective + ' ' + e.blockedURI.replace(/\\?.*$/, '')));
          const f = await fetch('https://example.com/').then(() => 'sent').catch(() => 'blocked');
          const i = await new Promise(res => { const im = new Image(); im.onload = () => res('sent'); im.onerror = () => res('blocked'); im.src = 'https://example.com/x.png?d=1'; });
          const x = await new Promise(res => { try { const s = document.createElement('script'); s.src = 'https://example.com/x.js'; s.onload = () => res('sent'); s.onerror = () => res('blocked'); document.head.appendChild(s); } catch (e) { res('blocked'); } });
          try { navigator.sendBeacon('https://example.com/b', 'x'); } catch (e) {}
          let ev = 'blocked'; try { ev = eval('1+1') === 2 ? 'ran' : 'blocked'; } catch (e) {}
          await new Promise(r => setTimeout(r, 400)); return [f, i, x, ev, [...new Set(v)].filter(s => s.indexOf('example.com') >= 0).sort()]; }""")
        check(f'B {tool}: CSP blocks fetch/img/script/beacon/eval', r, ['blocked', 'blocked', 'blocked', 'blocked', ['connect-src https://example.com/', 'connect-src https://example.com/b', 'img-src https://example.com/x.png', 'script-src-elem https://example.com/x.js']])
        check(f'B {tool}: clean console in normal use', [perr, [c for c in cons if 'Content Security Policy' in c and 'example.com' not in c and 'eval' not in c]], [[], []])
        ctx.close()

    # ── 5. 좁은 화면: 올리기 칸이 설정보다 먼저, 가로 넘침 없음
    for tool in ('excel', 'pdf'):
        pg = b.new_page(viewport={'width': 390, 'height': 844}); pg.goto(f'{U}/{tool}-masking.html')
        check(f'N {tool}: upload first, no horizontal overflow', pg.evaluate("[document.getElementById('drop-zone').getBoundingClientRect().top < document.getElementById('inp-orig').getBoundingClientRect().top, document.documentElement.scrollWidth <= 390]"), [True, True])
        pg.close()
    b.close()

print(f'\nPASS {passed} / FAIL {len(fails)}', fails if fails else '')
sys.exit(1 if fails else 0)
