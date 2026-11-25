# 🥐 엄마의 제과기능사 — 필기 모의고사

어머님이 스마트폰·PC에서 제과기능사 필기(60문항)를 실전처럼 풀어 보는 학습 페이지입니다.
빌드 도구 없이 순수 HTML/CSS/JS로 동작하고, GitHub Pages의 `/mom/` 경로에만 배포합니다.
`<meta name="robots" content="noindex">` 로 검색 노출을 막아 두었습니다.

## 구성
- **📝 실전 모의고사**: 1~7회차 각 60문항(제과이론 20 · 재료과학 15 · 영양학 10 · 식품위생학 15), 총 420문항
  - 모든 회차에 공개 기출을 2026 기준으로 정비한 문항과 2026 최신 경향 신규 문항을 함께 배치
  - 4지선다 버튼, 선택 상태 표시, 진행률(`1 / 60`, 푼 문제 수)
  - `바로 정답 확인` 토글(기본 OFF — 실전처럼 다 풀고 채점)
  - 이전/다음 이동, 전체 문항 번호표(푼 문제/안 푼 문제 색 구분)
  - `채점하고 점수 보기` → 100점 환산 점수, 60점 이상 합격 배지, 과목별 정답률,
    오답 체크(내가 고른 답 빨강 / 정답 초록 + 해설), `틀린 문제만 다시 풀기`
  - 결과 하단 CTA → `다음 모의고사를 풀까요? (제2회~제7회)`, 7회 완료 후에는 420문항 랜덤 60문제 조합
- **📚 과목별 연습 · 오답노트**: 과목 필터, 틀린 문제 자동 수집(오답노트), 즉시 정답·해설
- **📖 핵심 요점 정리**: 4과목 × 6개 = 24개 카드
- 진행 답안과 오답노트는 `localStorage`에 자동 저장, 상단 `기록 초기화` 버튼 제공

## 폴더
```
site/mom-bakery/
  index.html  styles.css  app.js  manifest.webmanifest  .nojekyll
  assets/            아이콘
  data/questions.json  원본 그대로 복사한 문제은행(420문항)
  data/questions.js    같은 내용의 JS 번들(파일 직접 열기·fetch 실패 대비)
  tools/validate_questions.py   데이터 누락·변형 검수
  tools/dom_smoke_test.py       DOM 스모크 테스트
```

## 데이터 빌드
```
python3 work/bakery/build_420.py    # 기존 180문항 현행화 + 신규 240문항 → 7회차 재배치
python3 site/mom-bakery/tools/validate_questions.py
python3 site/mom-bakery/tools/dom_smoke_test.py
```
`work/bakery/` 에 기출 원본(backup)과 신규 문항 소스, 빌드 스크립트가 있습니다.

## 배포
```
bash scripts/deploy-mom-bakery.sh            # 검수 → mom/ 동기화 → main·gh-pages push → HTTP 확인
bash scripts/deploy-mom-bakery.sh --no-verify  # 검수 생략
```
루트(모닝 브리핑)와 `/dad/` 파일은 이 스크립트가 건드리지 않습니다.

- 배포 주소: https://everythingtokitty-house.github.io/everythingtokitty--house.github.io/mom/
