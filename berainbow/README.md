# 비더레인보우 사업 대시보드 (`/berainbow/`)

비더레인보우(`@be_rain_bow__`) 1인 사업자 전용 운영·마케팅 대시보드. 순수 HTML/CSS/JS, 빌드 도구 없음.

- 사이트: https://everythingtokitty-house.github.io/everythingtokitty--house.github.io/berainbow/
- 자동화 데이터: `./data/dashboard.json`
- 데이터 생성: `python3 site/berainbow/tools/build_data.py` → `data/dashboard.json`, `data/dashboard.js`
- 검수: `python3 tools/audit_berainbow.py`, `python3 tools/dom_smoke_test.py`
- 배포: `bash scripts/deploy-berainbow.sh` (berainbow/ 밖 파일이 바뀌면 중단)

## 탭 구성
1. 오늘 할 일 & 진단 요약 — KPI, 확정 전략, 체크리스트(localStorage), 헬로키티 사입 리스크, 가격 로드맵, 순마진 계산기
2. 쿠팡·스마트스토어 SEO — 상품명 3안, 태그 20개, 대표이미지 정책, 배너 CTA
3. 경쟁 계정 & 벤치마킹 — 7곳 + 공통 성공 공식
4. 시즌별 마케팅 & 영상 기획 — 12~5월 로드맵, 릴스 30초 콘티 3종
5. GPT 자동화 프롬프트 허브 — 4종 프롬프트 + JSON 사용법

## 업데이트
매주 금요일. `build_data.py`의 해당 주차 값(KPI·진단·일정)을 고치고 `bash scripts/deploy-berainbow.sh`를 실행한다.
