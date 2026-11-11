# 마스킹 도구 원본 (Excel · PDF)

배포되는 파일은 `excel-masking.html`, `pdf-masking.html` 두 개다. 둘 다 **이 폴더의 원본을 빌드한 결과물**이므로 직접 고치지 않는다. (빌드 스크립트는 결과를 `../apps/`에 쓴다. 이 저장소에서는 저장소 맨 위로 옮겨 둔다.)

## 고치는 순서

1. 이 폴더의 원본을 고친다.
2. `node tools-src/build.mjs` — `apps/`의 두 파일을 다시 만든다.
3. `python3 tools-src/tests/test_masking.py` — 전부 PASS여야 한다. (apps/가 원본과 다르면 첫 줄에서 실패한다.)
4. 결과물(`excel-masking.html`, `pdf-masking.html`)과 `tools-src/`를 한 커밋으로 올린다.

준비물: Node 18 이상, Python 3, `pip install -r tools-src/tests/requirements.txt`, `playwright install chromium`.

## 어디를 고치나

| 고치려는 것 | 파일 |
|---|---|
| 자동으로 찾는 번호(패턴), 치환 규칙, 번호 매기기 | `engine.js` (두 도구가 같이 쓴다) |
| 단어 목록, 보관 방식, 확인 창, 결과 요약, 저장 전 확인, 치환 대응표 | `common.js` (두 도구가 같이 쓴다) |
| 엑셀 읽기·표 미리보기·저장 | `excel.js` |
| PDF 글자 추출·글 보기·복사 | `pdf.js` |
| 색·글꼴·배치 | `tool.css` (값은 recastfai.com 첫 화면과 같게 둔다) |
| 상단·왼쪽 칸·확인 칸·바닥글 문구 | `parts/*.html` |
| 도구별 화면 뼈대, 제목·설명 문구 | `excel-masking.html`, `pdf-masking.html` |
| 버전·날짜 | `version.json` (고칠 때마다 올린다) |

패턴을 추가할 때는 `engine.js`의 `PATTERNS`에 한 줄을 넣고, `tests/test_masking.py`의 `ENGINE` 목록에 "가려야 하는 예"와 "가리면 안 되는 예"를 같이 넣는다.

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

## 알려진 한계 (화면에도 적혀 있다)

- 이름·상호·주소는 등록한 단어만 가린다. 자동으로 찾지 않는다.
- 하이픈 없는 계좌번호는 규칙이 없어 자동으로 못 가린다. "저장 전 확인"에 남은 긴 숫자로 뜬다.
- 스캔(이미지) PDF는 읽지 못한다. PDF 결과는 글자만 나온다(원래 배치의 PDF로 되돌리지 않는다).
- 치환 코드 번호는 파일마다 새로 매긴다.
- PDF에서 틈 없이 붙여 찍힌 두 숫자는 하나로 읽혀 가려지지 않을 수 있다("저장 전 확인"에 뜬다).
- Chromium(크롬·엣지)에서만 자동 테스트한다. 사파리·파이어폭스는 확인하지 않았다.
