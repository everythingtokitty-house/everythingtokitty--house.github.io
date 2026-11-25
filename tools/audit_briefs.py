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

# URL 형식
for url in sorted(all_urls):
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
