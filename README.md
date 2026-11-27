# 모닝 트렌드 브리핑 사이트

매일 아침 8시에 만드는 **마케터 모닝 트렌드 AI 브리핑**을 모아 두는 정적 사이트입니다.
빌드 도구 없이 HTML/CSS/바닐라 JS만 쓰므로 GitHub Pages에 폴더째 올리면 그대로 동작합니다.

2026-11-27부터는 맨 위에 **`✅ 오늘의 핵심 업무 TOP 5`** 패널이 붙어, 은빈 님이 매일 아침 제안된 업무 5건을
체크하며 진행률을 보고, 필요한 일을 직접 덧붙일 수 있는 '전용 업무 페이지'로도 쓰입니다.

- 대상 기기: iPhone(375~430px) 우선, PC에서는 760~820px 폭의 단일 칼럼으로 읽힙니다.
- 다크 모드: 시스템 설정을 따르고, 오른쪽 위 🌙 버튼으로 직접 바꿀 수 있습니다(선택은 브라우저에 저장).
- 홈 화면 추가: 매니페스트가 있어 Safari·Chrome에서 "홈 화면에 추가" 시 앱처럼 열립니다.

## 파일 구성

```
site/morning-brief/
├── index.html                 화면 뼈대 (헤더·검색·탭·날짜 칩·결과 컨테이너)
├── styles.css                 디자인 토큰(라이트/다크)·카드·타임라인 스타일
├── app.js                     데이터 로드·검색·필터·렌더링 (innerHTML 미사용)
├── manifest.webmanifest       홈 화면 추가용
├── .nojekyll                  GitHub Pages에서 Jekyll 처리 생략
├── assets/
│   ├── icon-192.png           아이콘
│   ├── icon-512.png
│   └── apple-touch-icon.png   iOS 홈 화면 아이콘(180px)
├── data/
│   ├── briefs.json            ← 원본 데이터(사이트가 fetch하는 파일)
│   └── briefs.js              같은 내용의 오프라인 사본(file:// 로 열 때 대체용)
└── tools/
    ├── build_briefs.py        work/trend-brief-*.md + work/character-collabs-*.json + work/morning-todos-*.json → data/briefs.json + briefs.js
    ├── audit_briefs.py        JSON 스키마·URL·수치 보존 검사 (키티·콜라보·오늘 업무는 원본 JSON과 대조)
    └── dom_smoke_test.py      QuickJS 최소 DOM으로 app.js 동작 검사(업무 체크·진행률·직접 추가 포함)
```

## 데이터 갱신 (새 브리핑이 생겼을 때)

1. `work/` 폴더에 `trend-brief-YYYY-MM-DD.md` 를 같은 형식으로 추가합니다.
   (제목 줄 `# 🔥 마케터 모닝 트렌드 AI 브리핑 — 2026.11.26(목)`, `## 1.~5.` 섹션, `### ①` 항목,
   `- 출처: / - URL: / - 확인된 게시: / - 확인된 내용: / - 왜 터졌나: / - 숏폼/SNS 응용:` 필드)
2. 변환·검증을 실행합니다.

```bash
python3 site/morning-brief/tools/build_briefs.py
python3 site/morning-brief/tools/audit_briefs.py
python3 site/morning-brief/tools/dom_smoke_test.py     # pip install quickjs 필요
```

`build_briefs.py`는 날짜를 최신순으로 정렬하고 `latestDate`·`counts`를 다시 계산하며,
`index.html`의 기본 선택 날짜는 이 `latestDate`를 따라갑니다. 날짜 칩도 자동으로 늘어납니다.
`--src-dir`·`--out-dir`·`--pattern`으로 경로를 바꿀 수 있습니다.

## 데이터 형식 (`data/briefs.json`)

```jsonc
{
  "updatedAt": "2026-11-25 08:00 KST 기준",
  "latestDate": "2026-11-25",
  "counts": { "days": 5, "items": 51, "extras": 28, "ideas": 17 },
  "briefs": [
    {
      "date": "2026-11-25",
      "weekday": "수",
      "headline": "오늘의 한 줄",
      "meta": [{ "label": "조사 시점", "extra": "", "value": "2026-11-25 07:50~08:20 KST" }],
      "items": [
        {
          "id": "2026-11-25-trend-1",
          "no": 1,
          "category": "trend",              // trend | marketing | ai
          "categoryLabel": "국내 화제",
          "title": "제목",
          "checked": "확인된 게시 일시",
          "summary": "핵심 내용(줄바꿈으로 포인트 보존)",
          "whyHot": "왜 터졌나",
          "insight": "숏폼·마케터 인사이트",
          "note": "같은 날짜 클리핑 등 보조 메모",
          "sourceText": "출처 표기 원문",
          "sources": [{ "label": "OSEN", "url": "https://..." }]
        }
      ],
      "extras": [{ "id": "2026-11-25-extra-1", "group": "짧게 전하는 소식", "title": "", "body": "", "sources": [] }],
      "ideas": ["오늘 바로 쓸 수 있는 기획 아이디어"],
      "caveats": ["확인하지 못한 것 / 주의"]
    }
  ]
}
```

원문 마크다운의 강조(`**굵게**`)는 값 안에 그대로 두고 화면에서 굵게 렌더합니다.
`summary`의 줄바꿈은 카드 안에서 문단/불릿으로 나뉘어 표시됩니다.

### 🎀 키티·콜라보 섹션 (`kittyCollabs`)

`work/character-collabs-YYYY-MM-DD.json`(가장 최근 파일)의 `characters[id=sanrio]` 항목을 `build_briefs.py`가 옮겨 담습니다.
원본을 고치고 다시 빌드하면 탭 내용도 같이 바뀝니다(원본의 콜라보명·공식 링크가 그대로 보존되는지 `audit_briefs.py`가 대조).

```jsonc
"kittyCollabs": {
  "asOf": "2026-11-26",
  "title": "산리오(헬로키티) 콜라보 최신 소식",
  "characterName": "산리오 (헬로키티 중심)",
  "sourceFile": "character-collabs-2026-11-26.json",
  "siteUrl": "https://everythingtokitty-house.github.io/everythingtokitty--house.github.io/characters/",
  "siteTitle": "🎀 8대 캐릭터 콜라보 전체 사이트 보기 →",
  "items": [
    {
      "id": "sanrio-01", "title": "콜라보명", "brand": "브랜드", "status": "진행중",
      "schedule": ["행사 기간 2026-11-19 ~ 2026-12-31"],      // 최대 4줄
      "priceLine": "23,000~61,000원 · 8개 품목", "priceNote": "가격 비고",
      "headline": "한 줄 요약", "points": ["핵심 포인트 1", "2", "3"],
      "visit": { "venue": "", "address": "", "period": "", "hours": "" },
      "links": [{ "label": "신세계그룹 뉴스룸", "url": "https://..." }]
    }
  ]
}
```

원본 파일이 없으면 이 섹션은 빠지고 탭도 나타나지 않습니다(`counts.kitty` = 0).

### ✅ 오늘의 핵심 업무 TOP 5 (`todos`)

`work/morning-todos-YYYY-MM-DD.json`(그 날짜 파일 → `morning-todos-latest.json` → 그 날짜 이전 최신 파일 순으로 탐색)을
`build_briefs.py`가 읽어 `todos`로 담습니다. 파일이 없으면 `todos` 키·탭·패널 없이 기존 화면 그대로 빌드됩니다.

```jsonc
"todos": {
  "date": "2026-11-27", "weekday": "금", "generatedAt": "2026-11-27T08:00:00+09:00",
  "note": "오늘 08:00 브리핑 기준 · 마감이 임박한 순서로 5건",
  "sourceFile": "morning-todos-2026-11-27.json",
  "items": [
    { "id": "kr-student-loan-20261127", "badge": "긴급·연체", "tone": "urgent",
      "title": "한국장학재단 학자금 연체 4건(총 139,488원) 가상계좌 상환",
      "detail": "11/24 시작(13,530원) + 11/27 신규 3건(125,958원) · 오후 5시 자동이체 종료로 앱/웹 직접 납부 필요" }
  ]
}
```

- 항목은 최대 5건. `tone`은 `urgent`·`due`·`reply`·`content`·`store` 중 하나이고, 없으면 `badge`로 추정합니다.
- 체크 상태와 직접 추가한 항목은 브라우저 `localStorage`의 **`morningBrief.todos.v1`** 에 날짜별로 저장됩니다
  (`{ "2026-11-27": { "done": ["id"], "custom": [{ "id", "badge", "title", "detail" }] } }`).
  서버로는 저장되지 않습니다.

## 화면 기능

- **✅ 오늘 업무 탭과 패널**: 탭 맨 앞 `✅ 오늘 업무 N`(N=남은 건수). `전체` 화면에서는 상단(필터바 아래)에
  `✅ 오늘의 핵심 업무 TOP 5` 패널이 고정으로 보이고, 탭을 누르면 업무만 크게 보는 화면이 됩니다.
  각 항목은 카테고리 배지 · 제목 · 실행 1줄 · 체크박스이고, 상단에 `n / 5 완료` + 프로그레스 바가 있습니다.
  체크하면 취소선·완료 스타일이 적용되고, `+ 직접 할 일 추가` 입력창으로 덧붙이거나 ✕ 로 삭제할 수 있습니다.
  업무 패널은 '전체' 화면에서만(검색 중에는 숨김) 보이며, 업무 탭에서 검색을 시작하면 전체 탭으로 돌아갑니다.
- **날짜 칩**: `전체 날짜` + 날짜별 칩(예: `11.25 수`), 기본 선택은 최신 날짜.
- **카테고리 탭**: 전체 / 🔥 국내 화제 / 📊 마케터 뉴스 / 🤖 AI 정보 / 🎀 키티·콜라보. 탭 옆 숫자는 현재 날짜 범위의 건수.
- **🎀 키티·콜라보 탭**: `work/character-collabs-YYYY-MM-DD.json` 의 산리오(헬로키티 중심) 항목을 카드로 보여 줍니다.
  카드에는 콜라보명·진행 상태·일정·가격·방문 정보·한 줄 요약·핵심 포인트·공식 링크가 들어가고,
  위아래에 **`🎀 8대 캐릭터 콜라보 전체 사이트 보기 →`**(`/characters/`) 버튼이 붙습니다.
  이 탭에서는 날짜 칩이 숨겨지고(콜라보 데이터는 날짜별 아카이브가 아님), 검색은 콜라보 카드 안에서 동작합니다.
- **검색**: 제목·요약·왜 터졌나·인사이트·출처(라벨·URL)를 대상으로 즉시 검색(공백으로 여러 단어 AND).
  선택한 날짜에 결과가 없으면 전체 날짜로 자동 확장하고 안내 배너를 띄웁니다. `/` 키로 검색창 포커스, `Esc`로 해제.
- 카드에는 확인 일시, 요약, `왜 터졌나`, `💡 마케터·숏폼 인사이트`(코랄 하이라이트 박스), 출처 칩을 담습니다.
- 날짜별로 `짧게 전하는 소식`(단신), `오늘 바로 쓸 수 있는 기획 아이디어`, 접이식 `확인하지 못한 것 · 주의`,
  `조사 범위·검증 원칙`이 함께 표시됩니다.

## GitHub Pages 배포

```bash
# 저장소 루트에 이 폴더를 그대로 올리는 경우
git add site/morning-brief && git commit -m "모닝 트렌드 브리핑 사이트" && git push
```

1. GitHub 저장소 → Settings → Pages → Source: `Deploy from a branch` → Branch `main`, 폴더 `/`(루트).
2. 주소는 `https://<계정>.github.io/<저장소>/site/morning-brief/` 형태가 됩니다.
   모든 경로가 상대경로(`./`)라 하위 폴더 배포에서도 그대로 동작합니다.
3. 폴더만 따로 배포하려면 `site/morning-brief` 내용을 저장소 루트에 두고 같은 방식으로 켜면 됩니다.

## 로컬에서 보기

```bash
cd site/morning-brief && python3 -m http.server 8000
# http://localhost:8000/
```

`index.html`을 더블클릭해 `file://` 로 열면 브라우저가 fetch를 막습니다. 이때는 `data/briefs.js`의
사본을 자동으로 사용하므로 화면은 뜨지만, 서버로 여는 편이 정확합니다.

## 검증 결과 (2026-11-27 기준)

- `audit_briefs.py`: 아이템 69건 · URL 241개 형식 통과, 🎀 키티·콜라보 13건·✅ 오늘 업무 5건 원본 JSON 대조 통과. 7일치 원문의 URL **누락 0**, 숫자(수치) **누락 0**.
- `dom_smoke_test.py`: **135개 검사 통과**(기본 진입, 탭·날짜 필터, 검색·자동 확장, XSS 텍스트 처리, 더 보기 토글, fallback/에러 화면, 키티·콜라보 탭, 비더레인보우 탭, 오늘 업무 체크·진행률·직접 추가·삭제·날짜별 저장·업무 데이터 없음 폴백). 기대값은 데이터에서 계산하므로 브리핑이 늘어도 그대로 돕니다.
