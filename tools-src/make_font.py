# 제목용 글꼴(Noto Serif KR)에서 이 도구 화면에 실제로 나오는 글자만 뽑아 작은 파일로 만든다.
#   실행: python3 tools-src/make_font.py <NotoSerifKR[wght].ttf 경로>
#   원본 글꼴: https://github.com/google/fonts/tree/main/ofl/notoserifkr  (SIL OFL 1.1)
#   준비: pip install fonttools brotli
# 화면 문구에 새 한글 글자가 생기면 build.mjs가 알려 준다. 그때 이 스크립트를 돌리고 다시 빌드한다.
# 글꼴 파일·글자 목록·vendor/checksums.json 을 한 번에 고친다.
import sys, os, json, glob, hashlib, base64
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset

here = os.path.dirname(os.path.abspath(__file__))
sources = glob.glob(os.path.join(here, '*.html')) + glob.glob(os.path.join(here, '*.js')) + glob.glob(os.path.join(here, 'parts', '*.html'))
text = ''.join(open(f, encoding='utf-8').read() for f in sources)
chars = set(chr(c) for c in range(0x20, 0x7F)) | set(ch for ch in text if ord(ch) > 0x7F and not (0xD800 <= ord(ch) <= 0xDFFF))
src = sys.argv[1]
font = TTFont(src)
opt = subset.Options(); opt.layout_features = ['*']; opt.name_IDs = [1, 2, 4, 6]; opt.notdef_outline = True
sub = subset.Subsetter(opt); sub.populate(unicodes=[ord(c) for c in chars]); sub.subset(font)   # 글자부터 줄이고
font = instancer.instantiateVariableFont(font, {'wght': (500, 600)})                              # 사이트가 쓰는 굵기 범위만 남긴다
have = set(chr(c) for c in font.getBestCmap())
out = os.path.join(here, 'vendor', 'fonts')
woff = os.path.join(out, 'NotoSerifKR-subset.woff2')
font.flavor = 'woff2'; font.save(woff)
open(os.path.join(out, 'glyphs.txt'), 'w', encoding='utf-8').write(''.join(sorted(have)))

sha = lambda path, algo: base64.b64encode(hashlib.new(algo, open(path, 'rb').read()).digest()).decode()
cpath = os.path.join(here, 'vendor', 'checksums.json')
c = json.load(open(cpath, encoding='utf-8'))
c['sha384']['fonts/NotoSerifKR-subset.woff2'] = 'sha384-' + sha(woff, 'sha384')
c['_source']['fonts/'] = ('https://github.com/google/fonts/tree/main/ofl/notoserifkr (Noto Serif KR, SIL OFL 1.1) → make_font.py로 부분집합. '
                          '마지막으로 쓴 원본 글꼴 sha256-' + sha(src, 'sha256'))
json.dump(c, open(cpath, 'w', encoding='utf-8'), ensure_ascii=False, indent=1, sort_keys=True)
print(len(have), '글자,', os.path.getsize(woff) // 1024, 'KB. 글꼴에 없는 글자:', ''.join(sorted(chars - have)) or '없음')
