# 🎀 캐릭터 콜라보 아카이브 (`/characters/`)

8대 캐릭터(산리오·디즈니·포켓몬·미피·짱구·몬치치·리락쿠마·스누피)의 2026년 국내 콜라보 30건을
기간·가격·구성·방문 정보까지 한 페이지에 모은 사이트입니다. 빌드 도구 없이 순수 HTML/CSS/JS 로 동작하고,
데이터는 `data/collabs.json` 하나로 분리되어 있어 GPT·블로그 자동화 도구가 그대로 읽을 수 있습니다.

- 배포 URL: <https://everythingtokitty-house.github.io/everythingtokitty--house.github.io/characters/>
- 데이터(JSON): <https://everythingtokitty-house.github.io/everythingtokitty--house.github.io/characters/data/collabs.json>

## 구성

| 경로 | 역할 |
|---|---|
| `index.html` | 화면 골격(헤더·자동화 바·연말 캘린더·필터·결과·푸터) |
| `styles.css` | 파스텔 카드 UI. 캐릭터별 색(`--ch`)과 모바일/PC 반응형 |
| `app.js` | 데이터 로드·필터·검색·카드 렌더·캔바/블로그용 복사 |
| `data/collabs.json` | 공개 데이터(자동화 연동용, 유일한 원천) |
| `data/collabs.js` | `file://` 로 열 때 fetch 가 막히는 경우를 위한 같은 내용 사본 |
| `tools/build_collabs.py` | 원본 JSON → `data/collabs.json` + `collabs.js` 빌드 |
| `tools/audit_collabs.py` | 누락·오류·수치 불일치 검수 |
| `tools/dom_smoke_test.py` | 최소 DOM으로 앱을 돌리는 스모크 테스트(탭·필터·검색·복사) |

## 갱신 방법

1. 조사 원본(`work/character-collabs-<날짜>.json`)을 고친다.
2. `python3 site/characters-brief/tools/build_collabs.py`
3. `python3 site/characters-brief/tools/audit_collabs.py`
4. `python3 site/characters-brief/tools/dom_smoke_test.py`
5. `bash scripts/deploy-characters-brief.sh`

배포 스크립트는 저장소의 `characters/` 폴더만 갱신하며, 루트(`/`)·`dad/`·`mom/` 파일은 건드리지 않습니다.
커밋 전에 `characters/` 밖 변경이 하나라도 있으면 배포를 중단합니다.

## 화면 기능

- **캐릭터 탭 9개**: 전체(30) / 산리오(키티중심) / 디즈니 / 포켓몬 / 미피 / 짱구 / 몬치치 / 리락쿠마 / 스누피
- **활용 계정 필터**: 전체 / 🎀 방구석키티 / ✈️ 애플트립(팝업·방문) / 🧩 캐릭터모음집
- **키워드 검색**: 콜라보명·브랜드·판매처·라인업·특징·가격 항목명·장소·주소·출처까지 검색, 일치 단어는 노란 형광 표시
- **카드 정보**: 제품 사진(차단·오류 시 캐릭터 배지 박스로 폴백), 상태 배지, 추천 계정, 일정, 판매처, 금액 리스트(할인가 병기), 구성·특징·라인업, 방문 정보(장소·주소·기간·운영시간·예약), 공식 링크, 출처·검증
- **📋 캔바/블로그용 복사**: 표지(뱃지·메인 헤드·서브 헤드·라인업) + 내지(제목·금액·구성·특징) + 방문 정보 + 공식 링크 + 출처를 클립보드로 복사
- **연말 오픈 캘린더**: 12/1 케이스티파이 포켓몬 → 12/2 스타벅스 2차 → 12/3 리락쿠마×하이큐 → 12/4 젤라또 피케 부산. 누르면 해당 카드로 이동
- **🤖 자동화용 JSON 데이터** 링크: `./data/collabs.json`

## 데이터 메모

- 확인되지 않은 값은 `미확인`으로 표기했습니다(가격·요금 등).
- `image_urls` 는 원문 페이지의 사진 주소입니다. 외부 이미지는 `referrerpolicy="no-referrer"` 로 요청하고,
  막히거나 깨지면 카드에서 제거하고 캐릭터 배지 박스를 보여 줍니다.
- 연합뉴스 등 '재판매 및 DB 금지' 이미지는 카드뉴스 제작 시 브랜드 공식 이미지로 대체하는 편이 안전합니다.
