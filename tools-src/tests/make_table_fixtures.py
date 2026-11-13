# "표 모양으로 보기" 시험용 PDF를 다시 만든다 (가짜 자료. 실제 회사·사람이 아니다)
#   실행: python3 tools-src/tests/make_table_fixtures.py
#   만드는 것:
#     fixtures/tb_cases.pdf   크롬 인쇄로 만든 문서. 쪽마다 한 가지 경우다 (아래 CASES 순서. 새 경우는 끝에 붙인다)
#     fixtures/tb_coords.pdf  좌표를 직접 찍은 3쪽: 열 순서로 그린 표, 세로 가운데 맞춘 칸, 돌려 놓은 쪽
#   준비: pip install pymupdf playwright && playwright install chromium, 글꼴 Noto Sans KR · DejaVu Sans Mono
# 글꼴이 다르면 줄이 바뀌는 자리가 달라져 기대 결과(fixtures/tb_*.md)도 달라진다.
# 다시 만들었으면 UPDATE_TB=1 python3 tools-src/tests/test_masking.py 로 기대 결과를 새로 적고, 달라진 내용을 눈으로 확인한 뒤 올린다.
import os, fitz
from playwright.sync_api import sync_playwright
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fixtures')
CSS = ("body{font-family:'Noto Sans KR';margin:0}section{page-break-after:always}table{border-collapse:collapse;margin:8px 0}"
       "td,th{border:1px solid #444}.r{text-align:right}.c{text-align:center}"
       ".a{font-size:10pt}.a td,.a th{padding:4px 8px}.a h1{font-size:15pt}"      # 넉넉한 칸
       ".b{font-size:9pt}.b td,.b th{padding:3px 6px}.b h1{font-size:14pt}")       # 촘촘한 칸
# (이름, 칸 크기 묶음, 그 쪽에만 쓰는 스타일, 내용)
CASES = [
  ('payslip', 'a', '',
   '<h1>2026년 10월 급여명세서</h1>\n<table><tr><th>성명</th><td>서지환</td><th>부서</th><td>재무팀</td><th>사번</th><td>A-20417</td></tr>\n<tr><th>주민등록번호</th><td>880512-1234567</td><th>지급일</th><td>2026-10-25</td><th>입금계좌</th><td>우리 1002-350-123456</td></tr></table>\n<table style="width:500px"><tr><th>지급항목</th><th>금액</th><th>공제항목</th><th>금액</th></tr>\n<tr><td>기본급</td><td class=r>3,200,000</td><td>국민연금</td><td class=r>144,000</td></tr>\n<tr><td>식대</td><td class=r>200,000</td><td>건강보험</td><td class=r>221,000</td></tr>\n<tr><td>직책수당</td><td class=r>300,000</td><td>고용보험</td><td class=r>28,800</td></tr>\n<tr><td></td><td></td><td>장기요양보험</td><td class=r>28,620</td></tr>\n<tr><td></td><td></td><td>소득세</td><td class=r>152,340</td></tr>\n<tr><td></td><td></td><td>지방소득세</td><td class=r>15,230</td></tr>\n<tr><th>지급합계</th><td class=r>3,700,000</td><th>공제합계</th><td class=r>589,990</td></tr>\n<tr><th colspan=3 class=c>실수령액</th><td class=r>3,110,010</td></tr></table>\n<p>문의: 인사팀 박민서 (02-2109-4567, hr@garam-precision.example)</p>'),
  ('invoice', 'a', '',
   '<h1>거래명세서</h1>\n<p>공급자: (주)가람정밀 (사업자등록번호 124-81-00998) 대표 서지환 / 경기도 화성시 동탄산단로 12</p>\n<p>공급받는자: 누리온상사 주식회사 (120-86-34567)</p>\n<table style="width:640px"><tr><th>No</th><th style="width:120px">품목</th><th>규격</th><th>수량</th><th>단가</th><th>공급가액</th><th>세액</th><th>비고</th></tr>\n<tr><td class=c>1</td><td>정밀 가공 브래킷 스테인리스 304 특주품</td><td>BK-204</td><td class=r>120</td><td class=r>12,500</td><td class=r>1,500,000</td><td class=r>150,000</td><td></td></tr>\n<tr><td class=c>2</td><td>샤프트</td><td>SH-88</td><td class=r>40</td><td class=r>88,000</td><td class=r>3,520,000</td><td class=r>352,000</td><td>긴급</td></tr>\n<tr><td class=c>3</td><td>베어링 하우징 알루미늄 주조품 후가공 포함</td><td>BH-12A</td><td class=r>15</td><td class=r>240,000</td><td class=r>3,600,000</td><td class=r>360,000</td><td></td></tr>\n<tr><td class=c>4</td><td>운송비</td><td></td><td class=r>1</td><td class=r>80,000</td><td class=r>80,000</td><td class=r>8,000</td><td></td></tr>\n<tr><th colspan=5 class=c>합 계</th><td class=r>8,700,000</td><td class=r>870,000</td><td></td></tr></table>\n<p>입금계좌: 기업은행 123-456789-01-011 (주)가람정밀 / 담당 김도윤 010-4821-7733</p>'),
  ('ledger', 'a', '',
   '<h1>거래처 원장 (2026년 3분기)</h1>\n<p>아래 표는 분기 말 기준 미수금 잔액이며, 잔액이 1억원을 넘는 거래처는 담당자가 따로 확인한 내용을 비고에 적었습니다. 이 문단은 표가 아닌 보통 글이라서 줄이 길게 이어지고 페이지 너비에서 줄이 바뀝니다. 문의는 재무팀으로 해 주세요.</p>\n<table style="width:660px"><tr><th style="width:90px">거래처</th><th>사업자번호</th><th>연락처</th><th>담당자</th><th>잔액</th><th>비고</th></tr>\n<tr><td>(주)가람정밀 화성 제2공장</td><td>124-81-00998</td><td>031-8012-3456</td><td>김도윤</td><td class=r>133,000,000</td><td>10/15 입금 예정</td></tr>\n<tr><td>누리온상사 주식회사</td><td>120-86-34567</td><td>02-2109-4567</td><td>박민서</td><td class=r>45,500,000</td><td></td></tr>\n<tr><td>한빛테크</td><td>214-87-51234</td><td>010-4821-7240</td><td>이서준</td><td class=r>8,250,000</td><td>세금계산서 재발행 요청 (dykim@hanbit-tech.example)</td></tr>\n<tr><td>다온물류</td><td>105-86-90123</td><td>051-720-1100</td><td>최하린</td><td class=r>121,000,000</td><td></td></tr>\n<tr><td>세림화학</td><td>606-81-44556</td><td>055-312-9000</td><td>정유나</td><td class=r>2,640,000</td><td></td></tr></table>\n<p>작성: 재무팀 서지환 / 계좌 301-0123-4567-81</p>\n<table><tr><th>구분</th><th>건수</th><th>금액</th></tr><tr><td>정상</td><td class=r>4</td><td class=r>189,390,000</td></tr><tr><td>연체</td><td class=r>1</td><td class=r>121,000,000</td></tr></table>'),
  ('boxes', 'a', '',
   '<h1>사업자등록 확인</h1>\n<table><tr><th>상호</th><th>등록번호 앞</th><th>가운데</th><th>뒤</th><th>전화 앞</th><th>가운데</th><th>뒤</th></tr>\n<tr><td>가람정밀</td><td>124</td><td>81</td><td>00998</td><td>010</td><td>4821</td><td>7733</td></tr>\n<tr><td>누리온상사</td><td>120</td><td>86</td><td>34567</td><td>02</td><td>2109</td><td>4567</td></tr>\n<tr><td>한빛테크</td><td>214</td><td>87</td><td>51234</td><td>031</td><td>8012</td><td>3456</td></tr></table>'),
  ('prose', 'a', '',
   '<h1>검토 의견</h1><p>가람정밀의 3분기 매출은 전년 같은 기간보다 12% 늘었고 매출채권 회전일수는 48일에서 53일로 길어졌습니다. 회전일수가 길어진 까닭은 누리온상사에 대한 결제 조건을 60일로 바꾼 데 있습니다.</p>\n<p>대표: 서지환 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; 연락처: 010-4821-7733</p>\n<p>주소: 경기도 화성시 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; 사업자번호: 124-81-00998</p>\n<ul><li>첫째, 대손충당금 설정률을 다시 봐야 합니다.</li><li>둘째, 재고자산 실사 차이 3건을 조정했습니다.</li></ul>'),
  ('gl', 'b', '.gl thead{display:table-header-group}.gl td{vertical-align:top}',
   "<h1>계정별원장 — 보통예금</h1><table style='width:100%'><thead><tr><th>일자</th><th>전표번호</th><th style='width:150px'>적요</th><th>거래처</th><th>차변</th><th>대변</th><th>잔액</th></tr></thead><tbody><tr><td>2026-10-01</td><td>1000</td><td>외상매출금 회수</td><td>누리온상사</td><td class=r></td><td class=r>4,050,000</td><td class=r>45,950,000</td></tr><tr><td>2026-10-02</td><td>1001</td><td>소모품 구입 — 사무용품 및 토너 카트리지 일괄 구매</td><td>가람정밀</td><td class=r></td><td class=r>3,750,000</td><td class=r>42,200,000</td></tr><tr><td>2026-10-03</td><td>1002</td><td>부품 매입대금 지급</td><td>동서무역</td><td class=r></td><td class=r>390,000</td><td class=r>41,810,000</td></tr><tr><td>2026-10-04</td><td>1003</td><td>부품 매입대금 지급</td><td>바른회계법인</td><td class=r></td><td class=r>2,470,000</td><td class=r>39,340,000</td></tr><tr><td>2026-10-05</td><td>1004</td><td>소모품 구입 — 사무용품 및 토너 카트리지 일괄 구매</td><td>누리온상사</td><td class=r></td><td class=r>8,470,000</td><td class=r>30,870,000</td></tr><tr><td>2026-10-06</td><td>1005</td><td>소모품 구입 — 사무용품 및 토너 카트리지 일괄 구매</td><td>동서무역</td><td class=r></td><td class=r>5,910,000</td><td class=r>24,960,000</td></tr><tr><td>2026-10-07</td><td>1006</td><td>운반비</td><td>한빛테크</td><td class=r></td><td class=r>480,000</td><td class=r>24,480,000</td></tr><tr><td>2026-10-08</td><td>1007</td><td>10월분 임차료</td><td>바른회계법인</td><td class=r>2,970,000</td><td class=r></td><td class=r>27,450,000</td></tr><tr><td>2026-10-09</td><td>1008</td><td>운반비</td><td>한빛테크</td><td class=r>1,210,000</td><td class=r></td><td class=r>28,660,000</td></tr><tr><td>2026-10-10</td><td>1009</td><td>부품 매입대금 지급</td><td>바른회계법인</td><td class=r></td><td class=r>3,820,000</td><td class=r>24,840,000</td></tr><tr><td>2026-10-11</td><td>1010</td><td>외상매출금 회수</td><td>솔빛전자</td><td class=r></td><td class=r>5,780,000</td><td class=r>19,060,000</td></tr><tr><td>2026-10-12</td><td>1011</td><td>운반비</td><td>동서무역</td><td class=r>2,110,000</td><td class=r></td><td class=r>21,170,000</td></tr><tr><td>2026-10-13</td><td>1012</td><td></td><td>솔빛전자</td><td class=r>7,960,000</td><td class=r></td><td class=r>29,130,000</td></tr><tr><td>2026-10-14</td><td>1013</td><td>급여 이체</td><td>다온물류</td><td class=r>4,650,000</td><td class=r></td><td class=r>33,780,000</td></tr><tr><td>2026-10-15</td><td>1014</td><td>법인카드 사용분 정산 (접대비, 거래처 미팅)</td><td>누리온상사</td><td class=r></td><td class=r>7,160,000</td><td class=r>26,620,000</td></tr><tr><td>2026-10-16</td><td>1015</td><td>운반비</td><td>청운산업</td><td class=r>5,890,000</td><td class=r></td><td class=r>32,510,000</td></tr><tr><td>2026-10-17</td><td>1016</td><td></td><td>세림화학</td><td class=r>8,970,000</td><td class=r></td><td class=r>41,480,000</td></tr><tr><td>2026-10-18</td><td>1017</td><td>운반비</td><td>동서무역</td><td class=r></td><td class=r>1,210,000</td><td class=r>40,270,000</td></tr><tr><td>2026-10-19</td><td>1018</td><td>10월분 임차료</td><td>청운산업</td><td class=r>1,690,000</td><td class=r></td><td class=r>41,960,000</td></tr><tr><td>2026-10-20</td><td>1019</td><td>부품 매입대금 지급</td><td>바른회계법인</td><td class=r></td><td class=r>6,850,000</td><td class=r>35,110,000</td></tr><tr><td>2026-10-21</td><td>1020</td><td>부가세 예정신고 납부</td><td>미래엔지니어링</td><td class=r>5,870,000</td><td class=r></td><td class=r>40,980,000</td></tr><tr><td>2026-10-22</td><td>1021</td><td>소모품 구입 — 사무용품 및 토너 카트리지 일괄 구매</td><td>청운산업</td><td class=r>6,090,000</td><td class=r></td><td class=r>47,070,000</td></tr><tr><td>2026-10-23</td><td>1022</td><td></td><td>누리온상사</td><td class=r></td><td class=r>2,770,000</td><td class=r>44,300,000</td></tr><tr><td>2026-10-24</td><td>1023</td><td>소모품 구입 — 사무용품 및 토너 카트리지 일괄 구매</td><td>청운산업</td><td class=r>630,000</td><td class=r></td><td class=r>44,930,000</td></tr><tr><td>2026-10-25</td><td>1024</td><td>부가세 예정신고 납부</td><td>가람정밀</td><td class=r>2,920,000</td><td class=r></td><td class=r>47,850,000</td></tr><tr><td>2026-10-26</td><td>1025</td><td>10월분 임차료</td><td>솔빛전자</td><td class=r>4,730,000</td><td class=r></td><td class=r>52,580,000</td></tr><tr><td>2026-10-27</td><td>1026</td><td>외상매출금 회수</td><td>다온물류</td><td class=r>1,200,000</td><td class=r></td><td class=r>53,780,000</td></tr><tr><td>2026-10-28</td><td>1027</td><td>10월분 임차료</td><td>다온물류</td><td class=r>7,870,000</td><td class=r></td><td class=r>61,650,000</td></tr><tr><td>2026-10-01</td><td>1028</td><td></td><td>누리온상사</td><td class=r>4,080,000</td><td class=r></td><td class=r>65,730,000</td></tr><tr><td>2026-10-02</td><td>1029</td><td>보통예금 이자 수령</td><td>바른회계법인</td><td class=r>1,710,000</td><td class=r></td><td class=r>67,440,000</td></tr><tr><td>2026-10-03</td><td>1030</td><td>보통예금 이자 수령</td><td>바른회계법인</td><td class=r></td><td class=r>8,390,000</td><td class=r>59,050,000</td></tr><tr><td>2026-10-04</td><td>1031</td><td>부가세 예정신고 납부</td><td>동서무역</td><td class=r>2,860,000</td><td class=r></td><td class=r>61,910,000</td></tr><tr><td>2026-10-05</td><td>1032</td><td>10월분 임차료</td><td>한빛테크</td><td class=r></td><td class=r>850,000</td><td class=r>61,060,000</td></tr><tr><td>2026-10-06</td><td>1033</td><td></td><td>솔빛전자</td><td class=r></td><td class=r>130,000</td><td class=r>60,930,000</td></tr></tbody></table>"),
  ('contacts', 'b', '.contacts th{padding:10px 6px}',
   '<h1>거래처 연락망</h1><table><tr><th>상호</th><th>사업자번호</th><th>전화</th><th>이메일</th><th>담당자</th></tr><tr><td>가람정밀</td><td>100-80-10000</td><td>02-2000-4000</td><td>info0@acorp.example</td><td>김도윤</td></tr><tr><td>누리온상사</td><td>107-81-11234</td><td>02-2011-4003</td><td>info1@bcorp.example</td><td>이서준</td></tr><tr><td>한빛테크</td><td>114-82-12468</td><td>02-2022-4006</td><td>info2@ccorp.example</td><td>박민서</td></tr><tr><td>다온물류</td><td>121-83-13702</td><td>02-2033-4009</td><td>info3@dcorp.example</td><td>최하린</td></tr><tr><td>세림화학</td><td>128-84-14936</td><td>02-2044-4012</td><td>info4@ecorp.example</td><td>정유나</td></tr><tr><td>미래엔지니어링</td><td>135-85-16170</td><td>02-2055-4015</td><td>info5@fcorp.example</td><td>강지호</td></tr><tr><td>동서무역</td><td>142-86-17404</td><td>02-2066-4018</td><td>info6@gcorp.example</td><td>조현우</td></tr><tr><td>청운산업</td><td>149-87-18638</td><td>02-2077-4021</td><td>info7@hcorp.example</td><td>윤수아</td></tr><tr><td>바른회계법인</td><td>156-88-19872</td><td>02-2088-4024</td><td>info8@icorp.example</td><td>장예진</td></tr><tr><td>솔빛전자</td><td>163-89-21106</td><td>02-2099-4027</td><td>info9@jcorp.example</td><td>임준영</td></tr></table>'),
  ('subtotal', 'b', '.subtotal td{vertical-align:bottom}',
   "<h1>부서별 경비 집계</h1><table style='width:520px'><tr><th>부서</th><th>계정</th><th>예산</th><th>실적</th><th>차이</th></tr><tr><td>재무팀</td><td>복리후생비</td><td class=r>3,000,000</td><td class=r>2,750,000</td><td class=r>250,000</td></tr><tr><td></td><td>여비교통비</td><td class=r>1,200,000</td><td class=r>1,460,000</td><td class=r>(260,000)</td></tr><tr><th colspan=2>재무팀 소계</th><td class=r>4,200,000</td><td class=r>4,210,000</td><td class=r>(10,000)</td></tr><tr><td colspan=5 style='height:10px;border:0'></td></tr><tr><td>영업팀</td><td>접대비</td><td class=r>5,000,000</td><td class=r>5,820,000</td><td class=r>(820,000)</td></tr><tr><td></td><td>차량유지비</td><td class=r>800,000</td><td class=r>640,000</td><td class=r>160,000</td></tr><tr><td></td><td>광고선전비 (온라인 배너 및 전시회 부스 임차 포함)</td><td class=r>12,000,000</td><td class=r>9,300,000</td><td class=r>2,700,000</td></tr><tr><th colspan=2>영업팀 소계</th><td class=r>17,800,000</td><td class=r>15,760,000</td><td class=r>2,040,000</td></tr><tr><th colspan=2>합계</th><td class=r>22,000,000</td><td class=r>19,970,000</td><td class=r>2,030,000</td></tr></table><p>(단위: 원) 괄호는 예산 초과.</p>"),
  ('side', 'b', '',
   "<h1>월별 매출과 매입</h1><div style='display:flex;gap:30px'><table><tr><th>월</th><th>매출</th><th>건수</th></tr><tr><td>7월</td><td class=r>116,200,000</td><td class=r>41</td></tr><tr><td>8월</td><td class=r>98,400,000</td><td class=r>37</td></tr><tr><td>9월</td><td class=r>121,900,000</td><td class=r>45</td></tr></table><table><tr><th>월</th><th>매입</th><th>건수</th></tr><tr><td>7월</td><td class=r>89,300,000</td><td class=r>22</td></tr><tr><td>8월</td><td class=r>70,150,000</td><td class=r>19</td></tr><tr><td>9월</td><td class=r>93,020,000</td><td class=r>27</td></tr></table></div>"),
  ('taxinv', 'b', '.taxinv td,.taxinv th{padding:4px 5px}',
   "<h1>전자세금계산서</h1><table style='width:100%'><tr><th rowspan=4>공급자</th><th>등록번호</th><td colspan=3>124-81-00998</td><th rowspan=4>공급받는자</th><th>등록번호</th><td colspan=3>120-86-34567</td></tr><tr><th>상호</th><td>(주)가람정밀</td><th>성명</th><td>서지환</td><th>상호</th><td>누리온상사(주)</td><th>성명</th><td>박민서</td></tr><tr><th>사업장</th><td colspan=3>경기도 화성시 동탄산단로 12</td><th>사업장</th><td colspan=3>서울시 금천구 가산디지털로 88</td></tr><tr><th>이메일</th><td colspan=3>tax@garam-precision.example</td><th>이메일</th><td colspan=3>acct@nurion.example</td></tr></table><table style='width:100%'><tr><th>작성일자</th><th>공급가액</th><th>세액</th><th>비고</th></tr><tr><td>2026-10-15</td><td class=r>8,700,000</td><td class=r>870,000</td><td></td></tr></table><table style='width:100%'><tr><th>월</th><th>일</th><th>품목</th><th>규격</th><th>수량</th><th>단가</th><th>공급가액</th><th>세액</th></tr><tr><td>10</td><td>15</td><td>정밀 가공 브래킷</td><td>BK-204</td><td class=r>120</td><td class=r>12,500</td><td class=r>1,500,000</td><td class=r>150,000</td></tr><tr><td>10</td><td>15</td><td>샤프트</td><td>SH-88</td><td class=r>40</td><td class=r>88,000</td><td class=r>3,520,000</td><td class=r>352,000</td></tr><tr><td>10</td><td>15</td><td>베어링 하우징</td><td>BH-12A</td><td class=r>15</td><td class=r>240,000</td><td class=r>3,600,000</td><td class=r>360,000</td></tr></table>"),
  ('mono', 'b', ".mono pre{font-family:'DejaVu Sans Mono',monospace;font-size:9pt}",
   '<pre>AR AGING REPORT                         2026-10-31\n\nCUSTOMER            BRN            CURRENT      31-60       61+\nGaram Precision     124-81-00998   12,500,000   3,300,000   0\nNurion Trading      120-86-34567    4,550,000           0   1,200,000\nHanbit Tech         214-87-51234      825,000     410,000   0\nTOTAL                              17,875,000   3,710,000   1,200,000\n\nContact: ar@garam-precision.example / 02-2109-4567</pre>'),
  # ── 독립 검토에서 조용히 틀리던 모양 (2026-11-13)
  # 머리글 없는 원장: 한 행에 차변·대변 가운데 한쪽만 있다. 두 열이 합쳐지면 안 된다
  ('nohdr', 'b', '',
   "<h1>보통예금 원장 (이어지는 쪽)</h1><table style='width:560px'>"
   "<tr><td>10-01</td><td>누리온상사 9월분 회수</td><td class=r></td><td class=r>12,400,000</td><td class=r>58,220,410</td></tr>"
   "<tr><td>10-02</td><td>국민연금 10월분</td><td class=r>1,296,000</td><td class=r></td><td class=r>56,924,410</td></tr>"
   "<tr><td>10-05</td><td>가람정밀 설비 유지보수</td><td class=r>3,300,000</td><td class=r></td><td class=r>53,624,410</td></tr>"
   "<tr><td>10-10</td><td>법인카드 10월 사용분</td><td class=r>2,184,300</td><td class=r></td><td class=r>51,440,110</td></tr>"
   "<tr><td>10-15</td><td>한빛테크 외상대 회수</td><td class=r></td><td class=r>8,250,000</td><td class=r>59,690,110</td></tr>"
   "<tr><td>10-25</td><td>10월 급여</td><td class=r>38,400,000</td><td class=r></td><td class=r>21,290,110</td></tr>"
   "<tr><td>10-31</td><td>결산이자</td><td class=r></td><td class=r>18,204</td><td class=r>21,308,314</td></tr></table>"),
  # 표 바로 위에 여러 덩어리로 놓인 안내 줄: 표의 행으로 들어오면 안 된다
  ('meta', 'b', ".meta .info{display:flex;justify-content:space-between;width:600px}",
   "<h1>거래처원장</h1><div class=info><span>거래처: 누리온상사 주식회사 (120-86-34567)</span><span>계정: 외상매출금</span><span>기간: 2026-10-01 ~ 2026-10-31</span></div>"
   "<table style='width:600px'><tr><th>일자</th><th>구분</th><th style='width:170px'>적요</th><th>차변</th><th>대변</th><th>잔액</th></tr>"
   "<tr><td></td><td></td><td>전기이월</td><td class=r></td><td class=r></td><td class=r>12,400,000</td></tr>"
   "<tr><td>10-02</td><td>매출</td><td>10월분 정밀부품 납품 (세금계산서 발행, 거래명세서 3매 첨부)</td><td class=r>8,800,000</td><td class=r></td><td class=r>21,200,000</td></tr>"
   "<tr><td>10-05</td><td>입금</td><td>9월분 외상대 회수</td><td class=r></td><td class=r>12,400,000</td><td class=r>8,800,000</td></tr>"
   "<tr><td>10-11</td><td>매출</td><td>브래킷 BK-204 120개</td><td class=r>1,650,000</td><td class=r></td><td class=r>10,450,000</td></tr>"
   "<tr><td>10-25</td><td>입금</td><td>어음 회수</td><td class=r></td><td class=r>5,000,000</td><td class=r>5,450,000</td></tr>"
   "<tr><td></td><td></td><td>[ 월 계 ]</td><td class=r>10,450,000</td><td class=r>17,400,000</td><td class=r></td></tr></table>"),
  # 숫자 없는 표, 두 행씩 묶여 있고 묶음 사이가 벌어짐: 두 행이 한 행으로 합쳐지면 안 된다
  ('pairs', 'a', ".pairs td{padding:2px 8px}.pairs tr.gap td{height:12px;border:0}",
   "<h1>업무 분장</h1><table><tr><th>부서</th><th>담당</th><th>업무</th><th>직급</th></tr>"
   "<tr><td>재무팀</td><td>서지환</td><td>결산, 세무 신고</td><td>부장</td></tr><tr><td></td><td>이서준</td><td>전표, 자금 일보</td><td>사원</td></tr><tr class=gap><td colspan=4></td></tr>"
   "<tr><td>인사총무팀</td><td>박민서</td><td>급여, 4대보험</td><td>대리</td></tr><tr><td></td><td>오세훈</td><td>비품, 차량 관리</td><td>사원</td></tr><tr class=gap><td colspan=4></td></tr>"
   "<tr><td>영업1팀</td><td>김도윤</td><td>국내 거래처 관리</td><td>과장</td></tr><tr><td></td><td>최하린</td><td>견적, 수주 등록</td><td>사원</td></tr></table>"),
  # 좁게 붙은 금액 열: 이웃 금액이 한 조각으로 나와도 열이 갈려야 한다
  ('tight', 'b', ".tight{font-size:9pt}.tight td,.tight th{padding:2px 5px}",
   "<h1>월별 경비</h1><table><tr><th>계정</th><th>7월</th><th>8월</th><th>9월</th><th>합계</th></tr>"
   "<tr><td>복리후생비</td><td class=r>2,310,000</td><td class=r>2,240,000</td><td class=r>2,100,000</td><td class=r>6,650,000</td></tr>"
   "<tr><td>여비교통비</td><td class=r>1,460,000</td><td class=r>980,000</td><td class=r>1,120,000</td><td class=r>3,560,000</td></tr>"
   "<tr><td>접대비</td><td class=r>5,820,000</td><td class=r>4,100,000</td><td class=r>3,950,000</td><td class=r>13,870,000</td></tr>"
   "<tr><th>합계</th><td class=r>9,590,000</td><td class=r>7,320,000</td><td class=r>7,170,000</td><td class=r>24,080,000</td></tr></table>"),
]

def make_cases():
    html = '<html><head><meta charset=utf-8><style>' + CSS + ''.join(c[2] for c in CASES) + '</style></head><body>'
    html += ''.join(f'<section class="{grp} {name}">{body}</section>' for name, grp, css, body in CASES) + '</body></html>'
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(); pg.set_content(html)
        pg.pdf(path=OUT + '/tb_cases.pdf', format='A4', margin={'top': '15mm', 'left': '14mm', 'right': '14mm', 'bottom': '15mm'})
        b.close()

def page_colwise(d):
    pg = d.new_page()
    cols = [(60, ['거래처','마바사물산','아자차인쇄소','다온물류']), (200, ['사업자번호','234-56-78901','345-67-89012','105-86-90123']), (330, ['담당','홍길동','김세무','최하린']), (430, ['금액','89,300,000','12,500,000','4,400,000'])]
    pg.insert_text((60, 60), '열순서로그린표', fontname='korea', fontsize=13)
    for x, vals in cols:
        for k, v in enumerate(vals): pg.insert_text((x, 100 + 22*k), v, fontname=('helv' if v.isascii() else 'korea'), fontsize=10)
    pg.insert_text((60, 220), '위표는열단위로그려졌습니다.', fontname='korea', fontsize=10)
def page_vcenter(d):
    pg = d.new_page()
    y = 80
    for x, v in [(60,'거래처'),(220,'사업자번호'),(340,'연락처'),(460,'잔액')]: pg.insert_text((x, y), v, fontname='korea', fontsize=10)
    rows = [(['(주)가람정밀화성','제2공장'], '124-81-00998', '031-8012-3456', '133,000,000'), (['누리온상사'], '120-86-34567', '02-2109-4567', '45,500,000'), (['한빛테크주식회사','경기지사'], '214-87-51234', '010-4821-7240', '8,250,000'), (['다온물류'], '105-86-90123', '051-720-1100', '121,000,000')]
    y = 110
    for name, bz, tel, amt in rows:
        hgt = 30 if len(name) == 2 else 24
        if len(name) == 2:
            pg.insert_text((60, y), name[0], fontname='korea', fontsize=10); pg.insert_text((60, y + 12), name[1], fontname='korea', fontsize=10)
            yc = y + 6
        else:
            pg.insert_text((60, y), name[0], fontname='korea', fontsize=10); yc = y
        for x, v in [(220, bz), (340, tel)]: pg.insert_text((x, yc), v, fontname='helv', fontsize=10)
        w = fitz.get_text_length(amt, fontname='helv', fontsize=10); pg.insert_text((520 - w, yc), amt, fontname='helv', fontsize=10)
        y += hgt
def page_rot(d):
    pg = d.new_page(width=595, height=842)
    # 가로로 보이게 90도 돌린 쪽: 글자는 세로 방향으로 찍고 쪽을 돌린다
    for r, vals in enumerate([['거래처','사업자번호','금액'],['마바사물산','234-56-78901','89,300,000'],['아자차인쇄소','345-67-89012','12,500,000'],['다온물류','105-86-90123','4,400,000']]):
        for c, v in enumerate(vals): pg.insert_text((80 + 24*r, 780 - 180*c), v, fontname=('helv' if v.isascii() else 'korea'), fontsize=10, rotate=90)
    pg.set_rotation(90)

def make_coords():
    d = fitz.open(); page_colwise(d); page_vcenter(d); page_rot(d)
    d.save(OUT + '/tb_coords.pdf', garbage=4, deflate=True)

if __name__ == '__main__':
    make_cases(); make_coords()
    for f in ('tb_cases.pdf', 'tb_coords.pdf'): print(f, os.path.getsize(os.path.join(OUT, f)), 'bytes')
