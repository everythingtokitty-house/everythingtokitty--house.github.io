# 아빠 전용 투자 · 부동산 브리핑

아버님 한 분을 위해 만든 정적 브리핑 사이트입니다. 은빈 님의 모닝 브리핑(`site/morning-brief/`)과 같은
에디토리얼 톤(같은 CSS 토큰·카드·탭·검색·다크모드)을 그대로 쓰고, 내용 구조만 투자·부동산에 맞췄습니다.

- 배포 주소: https://everythingtokitty-house.github.io/everythingtokitty--house.github.io/dad/
- 저장소 경로: `repos/everythingtokitty--house.github.io/dad/` (루트의 모닝 브리핑과 공존, 루트 파일은 건드리지 않음)

## 화면 구성

| 탭 | 내용 |
|---|---|
| 전체 | 오늘의 온도 표 + 코인/주식/우리집 요약 패널 + 부동산 3줄 요약 + 아버님께 한 줄 정리 |
| 🪙 코인 | 시세·김프, ETF 수급·모멘텀, 오늘의 이슈 3건, 체크 포인트 |
| 📈 주식 | 코스피/코스닥 마감·수급, 미국 증시, 섹터 순환매, 주목 종목, 체크 포인트 |
| 🏠 부동산 · 우리집 | 우리집 메인 카드(106동 806호) → 3단계 매도 전략 → 당근 매물 진단 → 경쟁 단지 비교표·카드 7개 → 강서구/명지 뉴스 → 근거 자료(실거래·매물·확인 한계) |

검색은 현재 탭 범위에서 제목·본문·출처를 모두 훑고, 결과 카드의 `열기 →`로 해당 섹션으로 이동합니다.

## 데이터 자동화

```bash
python3 site/dad-brief/tools/build_briefs.py   # work/dad-*.md → data/dad-briefs.json / .js
python3 site/dad-brief/tools/audit_briefs.py   # 원문 대비 수치·URL 누락 0건 검수
python3 site/dad-brief/tools/dom_smoke_test.py # 탭·검색·렌더링 스모크 테스트(quickjs)
```

- 입력: `work/dad-invest-YYYY-MM-DD.md`(매일), `work/dad-realestate-YYYY-MM-DD.md`(매주)
- 날짜별 파일이 쌓이면 자동으로 아카이브가 되고, 최신 날짜가 기본으로 열립니다(날짜 칩으로 이동).
- 빌더는 문장을 새로 쓰지 않고 원문의 제목·표·목록·문단을 구조만 바꿔 옮깁니다. 수치·URL은 원문 그대로입니다.
- 부동산 문서에서 우리집 카드·3안 전략·경쟁단지·뉴스는 정해진 절(§1·§5·§6·§7·§8)에서 뽑아 씁니다.
  절 번호나 제목이 바뀌면 `audit_briefs.py`가 실패로 알려 줍니다.

## 배포

```bash
bash scripts/deploy-dad-brief.sh            # 빌드 → 검수 → dad/ 동기화 → main·gh-pages push → HTTP 확인
bash scripts/deploy-dad-brief.sh --no-build # 파일만 동기화
```

모든 자산 경로는 상대경로(`./data/...`)라 `/<저장소>/dad/` 하위 어디에 놓여도 동작합니다.
