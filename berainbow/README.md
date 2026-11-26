# 비더레인보우 사업 대시보드 (`/berainbow/`)

비더레인보우(`@be_rain_bow__`) 1인 사업자 전용 운영·마케팅 대시보드. 순수 HTML/CSS/JS, 빌드 도구 없음.

- 사이트: https://everythingtokitty-house.github.io/everythingtokitty--house.github.io/berainbow/
- 자동화 데이터: `./data/dashboard.json`
- 데이터 생성: `python3 site/berainbow/tools/build_data.py` → `data/dashboard.json`, `data/dashboard.js`
- 검수: `python3 tools/audit_berainbow.py`, `python3 tools/dom_smoke_test.py`
- 배포: `bash scripts/deploy-berainbow.sh` (berainbow/ 밖 파일이 바뀌면 중단)

## 탭 구성
1. 오늘 할 일 & 진단 요약 — KPI, 주문·리뷰 구글시트 카드, 확정 전략(채널 분리), 체크리스트(localStorage), 헬로키티 사입 리스크, 가격 로드맵, 순마진 계산기(원가 기본 3,200원 · 쿠팡 70:30 배분)
2. 쿠팡·스마트스토어 SEO — 상품명 3안, 태그 20개, 대표이미지 정책, 배너 CTA
3. 경쟁 계정 & 벤치마킹 — 7곳 + 공통 성공 공식
4. 시즌별 마케팅 & 영상 기획 — 12~5월 로드맵, 릴스 30초 콘티 3종
5. GPT 자동화 프롬프트 허브 — 4종 프롬프트 + JSON 사용법
6. 🧮 단가·마진 계산기 — 재료비·포장비·인건비 + 수수료·물류·세금 → 순마진·내 실수령, 적정 판매가 3단계, 제품별 저장 목록(localStorage)

## 채널 원칙
- **쿠팡(로켓그로스) = 순수 악세사리 전용** — 페를레 웨딩 세트 단독 입고, 키티·캐릭터 상품 미입점
- **네이버 스마트스토어 = 악세사리 + 헬로키티 도매 굿즈** — 사입 전 정품·수입증명 확인
- 쿠팡은 공동 관리자와 수익 배분(은빈 70 : 공동 30) · 네이버·인스타 유입은 단독 100%
- 주문·배송·리뷰 현황은 구글시트 [비더레인보우 주문현황](https://docs.google.com/spreadsheets/d/1Gqdr0oy4apwlCrFj9Q3CQZgfEgEeyhQhc_QTUsbcyGc/edit)에서 관리

## 업데이트
매주 금요일. `build_data.py`의 해당 주차 값(KPI·진단·일정)을 고치고 `bash scripts/deploy-berainbow.sh`를 실행한다.
