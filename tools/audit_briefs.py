#!/usr/bin/env python3
"""data/briefs.json 무결성 검사.

1) JSON 스키마·필수 필드
2) 모든 URL 형식(http/https + 호스트) 및 원문 마크다운 대비 URL 누락
3) 원문 마크다운 대비 숫자(수치) 누락 — 사실·수치 보존 확인
4) 날짜·아이템 수 요약
실패 시 종료코드 1.
"""
import json
import os
import re
import sys
import glob
from urllib.parse import urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
JSON_PATH = os.path.join(HERE, "..", "data", "briefs.json")
URL_RE = re.compile(r"https?://[^\s,]+")
TRAIL = ".,;:)]}'\","
NUM_RE = re.compile(r"\d[\d,]*(?:\.\d+)?")

problems = []


def fail(msg):
    problems.append(msg)


def norm_urls(text):
    out = set()
    for u in URL_RE.findall(text):
        out.add(u.rstrip(TRAIL))
    return out


def walk_strings(node):
    if isinstance(node, str):
        yield node
    elif isinstance(node, list):
        for v in node:
            yield from walk_strings(v)
    elif isinstance(node, dict):
        for v in node.values():
            yield from walk_strings(v)


def nums(text):
    # 쉼표로 끝나는 토큰(예: "06:51,")은 같은 수치로 본다
    return set(tok.rstrip(",") for tok in NUM_RE.findall(text))


data = json.load(open(JSON_PATH, encoding="utf-8"))

for key in ("updatedAt", "latestDate", "counts", "briefs"):
    if key not in data:
        fail(f"최상위 키 누락: {key}")

dates = [b["date"] for b in data["briefs"]]
if dates != sorted(dates, reverse=True):
    fail(f"브리프 정렬이 최신순이 아님: {dates}")

total_items = 0
all_urls = set()
for brief in data["briefs"]:
    date = brief["date"]
    for key in ("date", "weekday", "headline", "meta", "items", "extras", "ideas", "caveats"):
        if key not in brief:
            fail(f"{date}: 키 누락 {key}")
    if not brief["headline"].strip():
        fail(f"{date}: 오늘의 한 줄 없음")
    seen_ids = set()
    for item in brief["items"]:
        total_items += 1
        for key in ("id", "category", "categoryLabel", "title", "summary", "whyHot",
                    "insight", "sources", "sourceText", "checked"):
            if key not in item:
                fail(f"{date}: 아이템 키 누락 {key} ({item.get('title', '')[:30]})")
        if item["category"] not in ("trend", "marketing", "ai"):
            fail(f"{date}: 잘못된 카테고리 {item['category']}")
        if not item["title"].strip() or not item["summary"].strip():
            fail(f"{date}: 제목/요약 비어 있음 ({item['id']})")
        if not item["sources"]:
            fail(f"{date}: 출처 URL 없음 ({item['title'][:40]})")
        if item["id"] in seen_ids:
            fail(f"{date}: 중복 id {item['id']}")
        seen_ids.add(item["id"])
        for src in item["sources"]:
            all_urls.add(src["url"])
            if not src["label"].strip():
                fail(f"{date}: 출처 라벨 없음 {src['url']}")
    if len(brief["items"]) == 0:
        fail(f"{date}: 아이템 0건")
    for extra in brief["extras"]:
        for src in extra["sources"]:
            all_urls.add(src["url"])

if total_items != data["counts"]["items"]:
    fail(f"counts.items({data['counts']['items']}) != 실제({total_items})")


# ---- 🎀 키티·콜라보 섹션 (원본 work/character-collabs-*.json 대조) ----
COLLAB_SOURCES = sorted(glob.glob(os.path.join(ROOT, "work", "character-collabs-*.json")))
kitty = data.get("kittyCollabs")
kitty_urls = set()


def check_kitty(kitty):
    for key in ("asOf", "title", "characterName", "sourceFile", "siteUrl", "items"):
        if not kitty.get(key):
            fail(f"kittyCollabs: 키가 없거나 비었음 ({key})")
    site_url = kitty.get("siteUrl", "")
    if not re.match(r"^https://[\w.-]+/", site_url):
        fail(f"kittyCollabs: 전체 사이트 링크 형식 오류 {site_url!r}")
    if "/characters/" not in site_url:
        fail(f"kittyCollabs: 전체 사이트 링크가 /characters/ 가 아님 {site_url}")

    seen = set()
    for item in kitty["items"]:
        iid = item.get("id", "?")
        for key in ("id", "title", "brand", "status", "priceLine", "headline", "links"):
            if not item.get(key):
                fail(f"kittyCollabs {iid}: 필드 없음/비었음 ({key})")
        if not item.get("schedule"):
            fail(f"kittyCollabs {iid}: 일정 없음")
        if not item.get("points"):
            fail(f"kittyCollabs {iid}: 핵심 포인트 없음")
        if len(item.get("points") or []) > 3:
            fail(f"kittyCollabs {iid}: 핵심 포인트가 3개를 넘음")
        if iid in seen:
            fail(f"kittyCollabs: 중복 id {iid}")
        seen.add(iid)
        for link in item.get("links") or []:
            kitty_urls.add(link.get("url", ""))
            if not link.get("label", "").strip():
                fail(f"kittyCollabs {iid}: 링크 라벨 없음 {link.get('url')}")


def check_kitty_source(kitty):
    src_path = os.path.join(ROOT, "work", kitty.get("sourceFile") or "")
    if not os.path.isfile(src_path):
        if not COLLAB_SOURCES:
            fail("kittyCollabs: 대조할 character-collabs 원본이 없음")
            return
        src_path = COLLAB_SOURCES[-1]
    payload = json.load(open(src_path, encoding="utf-8"))
    sanrio = next((c for c in payload.get("characters", []) if c.get("id") == "sanrio"), None)
    if not sanrio:
        fail(f"{os.path.basename(src_path)}: 산리오(sanrio) 항목 없음")
        return
    src_items = {it.get("id"): it for it in sanrio.get("items", [])}
    built = {it.get("id"): it for it in kitty["items"]}
    missing = sorted(set(src_items) - set(built))
    extra = sorted(set(built) - set(src_items))
    if missing:
        fail(f"kittyCollabs: 원본 산리오 {len(missing)}건 누락 {missing}")
    if extra:
        fail(f"kittyCollabs: 원본에 없는 항목 {extra}")
    for iid, src in src_items.items():
        item = built.get(iid)
        if not item:
            continue
        if item["title"] != src.get("collab_name"):
            fail(f"kittyCollabs {iid}: 콜라보명 불일치")
        src_urls = {u.rstrip(TRAIL) for u in src.get("official_urls") or []}
        got_urls = {l.get("url") for l in item.get("links") or []}
        if src_urls - got_urls:
            fail(f"kittyCollabs {iid}: 공식 링크 누락 {sorted(src_urls - got_urls)}")
        if got_urls - src_urls:
            fail(f"kittyCollabs {iid}: 원본에 없는 링크 {sorted(got_urls - src_urls)}")
    print(f"🎀 키티·콜라보 {len(kitty['items'])}건 · 원본 {os.path.basename(src_path)} 대조 완료")


if kitty:
    check_kitty(kitty)
    check_kitty_source(kitty)
    if data["counts"].get("kitty", 0) != len(kitty["items"]):
        fail(f"counts.kitty({data['counts'].get('kitty')}) != 실제({len(kitty['items'])})")
elif COLLAB_SOURCES:
    fail("kittyCollabs 없음 — character-collabs 원본은 있는데 키티·콜라보 탭 데이터가 없습니다")

# ---- ✅ 오늘 업무 패널 (원본 work/morning-todos-*.json 대조) ----
TODOS_SOURCES = sorted(glob.glob(os.path.join(ROOT, "work", "morning-todos-*.json")))
TODOS_TONES = {"urgent", "due", "reply", "content", "store", "etc"}
todos = data.get("todos")


def check_todos(todos):
    for key in ("date", "items", "sourceFile"):
        if not todos.get(key):
            fail(f"todos: 키가 없거나 비었음 ({key})")
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", str(todos.get("date", ""))):
        fail(f"todos: 날짜 형식 오류 {todos.get('date')!r}")
    items = todos.get("items") or []
    if not 1 <= len(items) <= 5:
        fail(f"todos: 항목 수가 1~5건이 아님 ({len(items)}건)")
    seen = set()
    for item in items:
        iid = item.get("id", "?")
        for key in ("id", "badge", "tone", "title", "detail"):
            if not str(item.get(key) or "").strip():
                fail(f"todos {iid}: 필드 없음/비었음 ({key})")
        if item.get("tone") not in TODOS_TONES:
            fail(f"todos {iid}: 톤 값이 올바르지 않음 {item.get('tone')!r}")
        if iid in seen:
            fail(f"todos: 중복 id {iid}")
        seen.add(iid)
    if data["counts"].get("todos", 0) != len(items):
        fail(f"counts.todos({data['counts'].get('todos')}) != 실제({len(items)})")

    src_path = os.path.join(ROOT, "work", todos.get("sourceFile") or "")
    if not os.path.isfile(src_path):
        if not TODOS_SOURCES:
            fail("todos: 대조할 morning-todos 원본이 없음")
            return
        src_path = TODOS_SOURCES[-1]
    try:
        src = json.load(open(src_path, encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as err:
        fail(f"todos: 원본을 읽지 못함 {os.path.basename(src_path)} ({err})")
        return
    src_items = {it.get("id"): it for it in src.get("items") or []}
    built = {it.get("id"): it for it in items}
    if set(src_items) != set(built):
        fail(f"todos: 원본과 항목 id가 다름 (원본 {len(src_items)} / 빌드 {len(built)})")
    for iid, source in src_items.items():
        item = built.get(iid)
        if not item:
            continue
        for field in ("title", "badge"):
            if str(source.get(field) or "").strip() != item[field]:
                fail(f"todos {iid}: {field} 불일치")
        if str(source.get("detail") or "").strip().replace("\n", " ") != item["detail"]:
            fail(f"todos {iid}: detail 불일치")
    print(f"✅ 오늘 업무 {len(items)}건 · 원본 {os.path.basename(src_path)} 대조 완료")


if todos:
    check_todos(todos)
else:
    todays = [p for p in TODOS_SOURCES
              if re.search(r"morning-todos-(\d{4}-\d{2}-\d{2})\.json$", p)
              and re.search(r"morning-todos-(\d{4}-\d{2}-\d{2})\.json$", p).group(1) == data["latestDate"]]
    if todays:
        fail(f"todos 없음 — 원본({os.path.basename(todays[0])})은 있는데 업무 패널 데이터가 없습니다")

# URL 형식
for url in sorted(all_urls | kitty_urls):
    p = urlparse(url)
    if p.scheme not in ("http", "https") or not p.netloc:
        fail(f"URL 형식 오류: {url}")
    if " " in url or "\n" in url:
        fail(f"URL에 공백 포함: {url}")

print(f"JSON 아이템 {total_items}건 / URL {len(all_urls)}개 형식 검사 완료")

# 원문 대비 누락 검사
json_by_date = {b["date"]: b for b in data["briefs"]}
for path in sorted(glob.glob(os.path.join(ROOT, "work", "trend-brief-*.md"))):
    m = re.search(r"trend-brief-(\d{4}-\d{2}-\d{2})\.md$", path)
    date = m.group(1)
    text = open(path, encoding="utf-8").read()
    brief = json_by_date.get(date)
    if not brief:
        fail(f"{date}: 원문은 있는데 JSON에 없음")
        continue
    blob = "\n".join(walk_strings(brief))
    missing_urls = norm_urls(text) - norm_urls(blob)
    if missing_urls:
        fail(f"{date}: 원문 URL 누락 {len(missing_urls)}건 → {sorted(missing_urls)[:5]}")
    # 원문에서 URL을 뺀 산문의 숫자와 비교(URL 안의 숫자는 제외)
    text_no_url = URL_RE.sub(" ", text)
    blob_no_url = URL_RE.sub(" ", blob)
    missing_nums = nums(text_no_url) - nums(blob_no_url)
    if missing_nums:
        fail(f"{date}: 원문 수치 누락 {len(missing_nums)}건 → {sorted(missing_nums)[:12]}")
    print(f"{date}: 아이템 {len(brief['items'])} · 단신 {len(brief['extras'])} · "
          f"아이디어 {len(brief['ideas'])} · 주의 {len(brief['caveats'])} · "
          f"URL {len(norm_urls(text))}개 확인")

if problems:
    print("\n❌ 문제 발견:")
    for p in problems:
        print(" -", p)
    sys.exit(1)

print("\n✅ 모든 검사 통과")
