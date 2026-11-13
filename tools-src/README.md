# 마스킹 도구 원본 (Excel · PDF)

배포되는 파일은 `apps/excel-masking.html`, `apps/pdf-masking.html` 두 개다. 둘 다 **이 폴더의 원본을 빌드한 결과물**이므로 `apps/`를 직접 고치지 않는다.

## 고치는 순서

1. 이 폴더의 원본을 고친다.
2. `node tools-src/build.mjs` — `apps/`의 두 파일을 다시 만든다.
3. `python3 tools-src/tests/test_masking.py` — 전부 PASS여야 한다. (apps/가 원본과 다르면 첫 줄에서 실패한다.)
4. `apps/`와 `tools-src/`를 **한 커밋으로** 올린다. `main`에 push하면 Vercel이 바로 배포한다.
   - 커밋 작성자 메일은 이 저장소의 예전 배포 커밋과 같은 메일이어야 한다(Vercel 계정에 연결된 메일). 다르면 Vercel이 배포를 막는다(BLOCKED). 막히면 그 메일로 빈 커밋을 하나 더 올리면 배포된다.
   - 커밋 메시지에 `Co-Authored-By:` 줄이 있어도 막힌다(무료 플랜은 협업자를 허용하지 않는다).
5. 배포 뒤 `https://recastfai.com/apps/excel-masking.html`이 열리는지, `https://recastfai.com/tools-src/build.mjs`가 404인지 본다 (`.vercelignore`로 이 폴더는 배포에서 뺀다).
6. 공개 저장소 `recastfai/recastfai-tools`에 같은 파일을 올린다 (아래 "공개 저장소").

준비물: Node 18 이상, Python 3, `pip install -r tools-src/tests/requirements.txt`, `playwright install chromium`.

## 어디를 고치나

| 고치려는 것 | 파일 |
|---|---|
| 자동으로 찾는 번호(패턴), 치환 규칙, 번호 매기기 | `engine.js` (두 도구가 같이 쓴다) |
| 단어 목록, 보관 방식, 확인 창, 결과 요약, 저장 전 확인, 치환 대응표 | `common.js` (두 도구가 같이 쓴다) |
| 엑셀 읽기·표 미리보기·저장 | `excel.js` |
| PDF 글자 추출·표 모양으로 보기·글 보기·복사·저장 | `pdf.js` |
| 색·글꼴·배치 | `tool.css` (값은 recastfai.com 첫 화면과 같게 둔다) |
| 상단·왼쪽 칸·확인 칸·바닥글 문구 | `parts/*.html` |
| 도구별 화면 뼈대, 제목·설명 문구 | `excel-masking.html`, `pdf-masking.html` |
| 버전·날짜 | `version.json` (고칠 때마다 올린다) |

패턴을 추가할 때는 `engine.js`의 `PATTERNS`에 한 줄을 넣고, `tests/test_masking.py`의 `ENGINE` 목록에 "가려야 하는 예"와 "가리면 안 되는 예"를 같이 넣는다.

## PDF "표 모양으로 보기"

PDF에서 표를 찾았을 때만 체크 칸이 보인다. 켜면 표를 마크다운 표(`| 칸 | 칸 |`)로 바꿔 화면에 표로 그리고, 저장은 `.md`로 한다. 기본은 꺼져 있다(글 그대로, `.txt`).

- 표는 글자 조각의 좌표만으로 짐작한다(PDF의 괘선은 보지 않는다). 규칙은 `pdf.js`의 "표 모양으로 보기" 절 주석에 순서대로 적혀 있다.
- 가리기는 표 글에 바로 하지 않는다. 칸 구분을 걷어 낸 글에 엔진을 그대로 돌리고(`mdFlat` → `maskText`) 칸 구분을 제자리에 되돌린다(`mdRestore`). 그래서 칸에 걸쳐 나뉜 번호나 칸 안에서 줄이 바뀐 상호도 글 그대로일 때와 같게 가려진다.
- 안전장치(`tableLoss`): 글 그대로일 때 가려지는 값이 표 모양에서 같은 횟수만큼 가려지지 않으면 표 모양을 켜지 않고 글 그대로 보여 준다. 이 줄은 지우지 않는다.
- 시험 PDF는 `tests/fixtures/tb_*.pdf`, 기대 결과는 `tests/fixtures/tb_*.md`다. 표 찾는 규칙을 일부러 바꿨으면 `UPDATE_TB=1 python3 tools-src/tests/test_masking.py`로 기대 결과를 새로 적고, `git diff`로 달라진 표를 눈으로 확인한 뒤 올린다. 시험 PDF 자체는 `python3 tools-src/tests/make_table_fixtures.py`로 다시 만든다(`pip install pymupdf` 필요).

## 빌드가 멈출 때

- **"글꼴에 없는 글자 ○○"**: 화면 문구에 새 한글 글자가 생겼다. 제목용 글꼴은 화면에 나오는 글자만 뽑아 넣기 때문이다.
  `python3 tools-src/make_font.py <NotoSerifKR[wght].ttf 경로>`를 돌리고 다시 빌드한다. (원본 글꼴은 https://github.com/google/fonts/tree/main/ofl/notoserifkr 에서 받는다. `pip install fonttools brotli` 필요. 글꼴 파일·글자 목록·해시 기록을 한 번에 고친다.)
- **"해시 불일치"**: `vendor/`의 파일이 기록(`vendor/checksums.json`)과 다르다. 일부러 바꾼 게 아니면 파일을 되돌린다.
- **"isEvalSupported:false 가 없다" / "CSP …"**: 보안 방어선을 지웠다는 뜻이다. 되돌린다.

## 라이브러리를 올릴 때

- SheetJS: `vendor/xlsx.full.min.js`를 https://cdn.sheetjs.com 의 새 버전으로 바꾸고, `vendor/checksums.json`의 해시와 `_source`, `build.mjs`의 `licenses()` 안 버전 글자를 고친다.
- pdf.js: 지금은 3.11.174다. 4.x부터는 배포 파일이 모듈(.mjs)뿐이라 파일만 바꿔서는 안 되고 `pdf.js`의 `initPDFJS()`와 빌드의 넣는 방식을 다시 짜야 한다. 올린다면 6.2.108 이상으로 간다(5.6.83~6.2.108 미만은 CVE-2026-16633 대상). 3.11.174의 CVE-2024-4367은 `isEvalSupported:false`와 CSP(eval 금지)로 막고 있다.
- 반기에 한 번 두 라이브러리의 보안 공지를 확인한다: https://github.com/advisories?query=pdfjs-dist , https://cdn.sheetjs.com/advisories/

## 지키는 것

- 외부 호출 0곳: 스크립트·글꼴·그림을 모두 파일 안에 넣는다. CDN 주소를 넣으면 빌드가 멈춘다.
- 등록한 단어는 기본으로 저장하지 않는다(탭 메모리에만 둔다). "보관"을 켰을 때만 localStorage에 쓴다.
- 치환 코드: 등록 단어는 `[회사A]`, 자동 패턴은 `[사업자번호1]`처럼 번호를 붙인다. 같은 값은 같은 번호다.

## 공개 저장소

도구의 GitHub 링크는 `recastfai/recastfai-tools`를 가리킨다. 배포할 때마다 그 저장소에 `apps/`의 두 HTML과 이 폴더(`tools-src/`)를 같은 내용으로 올린다.

## 알려진 한계 (화면에도 적혀 있다)

- 이름·상호·주소는 등록한 단어만 가린다. 자동으로 찾지 않는다.
- 하이픈 없는 계좌번호는 규칙이 없어 자동으로 못 가린다. "저장 전 확인"에 남은 긴 숫자로 뜬다.
- 스캔(이미지) PDF는 읽지 못한다. PDF 결과는 글자(또는 마크다운 표)로만 나온다(원래 배치의 PDF로 되돌리지 않는다).
- "표 모양으로 보기"는 좌표로 짐작하므로 틀릴 수 있다. 쪽이 바뀌면 표도 따로 나온다. 2026-11-13 독립 검토(가짜 문서 65종)에서 고치지 못하고 남은 모양:
  - 칸을 여러 개 합친 양식(세금계산서, 원천징수영수증), 두 줄짜리 머리글(위 칸 이름이 표 밖으로 빠지거나 아래 칸 하나에만 붙는다)
  - 칸 좌우 여백이 1~2px뿐인 아주 촘촘한 표(글자와 금액이 한 조각으로 나온다), 넘친 글이 옆 칸의 금액에 닿은 표
  - 나란히 놓인 두 표나 표 옆의 글(한 표로 붙는다), 여백 없이 붙은 표 여럿, 한 칸에 날짜가 두 줄이면서 맞춤이 섞인 표
  - 실제 ERP·은행·홈택스·엑셀·한글이 만든 PDF로는 아직 확인하지 못했다(크롬 인쇄와 좌표를 직접 찍은 PDF로만 봤다)
- 치환 코드 번호는 파일마다 새로 매긴다.
- PDF에서 틈 없이 붙여 찍힌 두 숫자는 하나로 읽혀 가려지지 않을 수 있다("저장 전 확인"에 뜬다).
- Chromium(크롬·엣지)에서만 자동 테스트한다. 사파리·파이어폭스는 확인하지 않았다.
