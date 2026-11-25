# 모닝 트렌드 브리핑 사이트

매일 아침 8시에 만드는 **마케터 모닝 트렌드 AI 브리핑**을 모아 두는 정적 사이트입니다.
빌드 도구 없이 HTML/CSS/바닐라 JS만 쓰므로 GitHub Pages에 폴더째 올리면 그대로 동작합니다.

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
    ├── build_briefs.py        work/trend-brief-*.md → data/briefs.json + briefs.js
    ├── audit_briefs.py        JSON 스키마·URL·수치 보존 검사
    └── dom_smoke_test.py      QuickJS 최소 DOM으로 app.js 동작 검사(42개)
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

## 화면 기능

- **날짜 칩**: `전체 날짜` + 날짜별 칩(예: `11.25 수`), 기본 선택은 최신 날짜.
- **카테고리 탭**: 전체 / 🔥 국내 화제 / 📊 마케터 뉴스 / 🤖 AI 정보. 탭 옆 숫자는 현재 날짜 범위의 건수.
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

## 검증 결과 (2026-11-25 기준)

- `audit_briefs.py`: 아이템 51건 · URL 144개 형식 통과. 5일치 원문의 URL **누락 0**, 숫자(수치) **누락 0**.
- `dom_smoke_test.py`: 42개 검사 통과(기본 진입, 탭·날짜 필터, 검색·자동 확장, XSS 텍스트 처리, 더 보기 토글, fallback/에러 화면).
