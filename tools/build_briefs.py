#!/usr/bin/env python3
"""모닝 트렌드 브리핑 마크다운(work/trend-brief-YYYY-MM-DD.md)을
사이트용 JSON(data/briefs.json)과 로컬 미리보기용 data/briefs.js로 변환한다.

원문의 사실·수치·URL을 그대로 옮기는 것이 목적이므로, 문장을 새로 쓰지 않고
블록 구조만 해석한다.

사용법:
  python3 site/morning-brief/tools/build_briefs.py                 # 기본 경로
  python3 site/morning-brief/tools/build_briefs.py --src-dir work --out-dir site/morning-brief/data
"""
import argparse
import glob
import json
import os
import re
import sys

CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩"
CATEGORY_BY_SECTION = {1: ("trend", "국내 화제"), 2: ("marketing", "마케터 뉴스"), 3: ("ai", "AI 정보")}

CONTENT_KEYS = {
    "확인된 내용", "확인된 수치·내용", "확인된 수치", "확인된 집계",
    "확인된 수치·사양", "확인된 사양", "확인된 내용·수치", "핵심", "미확인",
}
KNOWN_KEYS = CONTENT_KEYS | {
    "출처", "URL", "확인된 게시", "확인된 시각", "왜 터졌나",
    "숏폼/SNS 응용", "숏폼 응용", "인사이트", "실무 활용", "같은 날짜 클리핑",
    "비고", "참고",
}
INSIGHT_KEYS = ["숏폼/SNS 응용", "숏폼 응용", "인사이트", "실무 활용"]

# 도메인 → 출처 표기 (모르는 도메인은 호스트명을 그대로 쓴다)
DOMAIN_LABELS = {
    "yna.co.kr": "연합뉴스", "hankyung.com": "한국경제", "etnews.com": "전자신문",
    "zdnet.co.kr": "ZDNet코리아", "news1.kr": "뉴스1", "fnnews.com": "파이낸셜뉴스",
    "madtimes.co.kr": "매드타임스", "i-boss.co.kr": "아이보스", "aitimes.com": "AI타임스",
    "edaily.co.kr": "이데일리", "chosun.com": "조선닷컴", "mk.co.kr": "매일경제",
    "osen.co.kr": "OSEN", "dima.tools": "디마툴즈", "trafficscent.com": "TrafficScent",
    "shortsmith.kr": "쇼츠스미스", "igeotteum.com": "이거뜸", "rallyt.kr": "랠릿 스탯",
    "namu.wiki": "나무위키", "x.com": "X", "newsis.com": "뉴시스", "ytn.co.kr": "YTN",
    "acrc.go.kr": "국민권익위원회", "kakaocorp.com": "카카오", "seoul.co.kr": "서울신문",
    "segye.com": "세계일보", "kstyleseoul.co.kr": "K-STYLE SEOUL",
    "tamagotchi-official.com": "다마고치 공식", "theviewers.co.kr": "뷰어스",
    "fntoday.co.kr": "파이낸스투데이", "mhns.co.kr": "더쎈뉴스",
    "stardailynews.co.kr": "스타데일리뉴스", "support.google.com": "Google 고객센터",
    "searchengineland.com": "Search Engine Land", "dpg.danawa.com": "다나와 DPG",
    "claude.com": "앤트로픽", "support.claude.com": "앤트로픽 지원센터",
    "thedefiant.io": "The Defiant", "alphasignal.ai": "AlphaSignal",
    "youtube.com": "YouTube", "topstarnews.net": "톱스타뉴스", "inven.co.kr": "인벤",
    "marvel.com": "Marvel.com", "banronbodo.com": "반론보도닷컴", "newspim.com": "뉴스핌",
    "businessinsider.com": "Business Insider", "techcrunch.com": "TechCrunch",
    "blog.google": "Google 블로그", "theverge.com": "The Verge", "euronews.com": "Euronews",
    "watch.impress.co.jp": "Impress Watch", "prtimes.jp": "PR TIMES",
    "newsroom.tiktok.com": "TikTok 뉴스룸", "xportsnews.com": "엑스포츠뉴스",
    "popply.co.kr": "팝플리", "ifai.io": "IFAI", "k-ainews.com": "한국인공지능신문",
    "tokenpost.kr": "토큰포스트", "aitimes.kr": "인공지능신문", "oossa.com": "Oossa",
    "marktechpost.com": "MarkTechPost", "developers.openai.com": "OpenAI 개발자 문서",
    "engadget.com": "Engadget", "digitalfocus.news": "디지털포커스", "ithome.com": "IT之家",
    "zerowiz.com": "제로위즈", "investor.nvidia.com": "엔비디아 IR",
    "star.ytn.co.kr": "YTN star", "cineplay.co.kr": "씨네플레이", "kppost.com": "케이팝포스트",
    "dailysecu.com": "데일리시큐", "isplus.com": "일간스포츠", "mydaily.co.kr": "마이데일리",
    "businessplus.kr": "비즈니스플러스", "digitalchosun.dizzo.com": "디지털조선일보",
    "slist.kr": "슬리스트", "partnerlounge.kakaostyle.com": "카카오스타일 파트너라운지",
    "marketingtimes.co.kr": "마케팅타임즈", "vigtiger.com": "vigtiger",
    "blog.nasmedia.co.kr": "나스미디어", "ainewswave.com": "AI 뉴스웨이브",
    "it.chosun.com": "IT조선", "asiae.co.kr": "아시아경제", "cosmorning.com": "코스모닝",
    "shinsegaegroupnewsroom.com": "신세계그룹 뉴스룸", "theguardian.com": "The Guardian",
    "bbc.com": "BBC News 코리아", "leanprover-community.github.io": "Lean 커뮤니티",
    "math.mit.edu": "MIT", "theverge.com": "The Verge", "ft.com": "FT",
}

URL_RE = re.compile(r"https?://[^\s,]+")
TRAIL = ".,;:)]}'\","  # URL 끝에 붙은 문장부호 제거용


def host_label(url: str) -> str:
    host = re.sub(r"^https?://", "", url).split("/")[0].lower()
    host = host[3:] if host.startswith("www.") else host
    for domain, label in DOMAIN_LABELS.items():
        if host == domain or host.endswith("." + domain):
            return label
    return host


def take_urls(text: str):
    """텍스트에서 URL을 뽑아 (남은 텍스트, [url...])로 돌려준다."""
    urls = [u.rstrip(TRAIL) for u in URL_RE.findall(text)]
    cleaned = URL_RE.sub("", text)
    cleaned = re.sub(r"\(\s*\)", "", cleaned)
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned)
    cleaned = re.sub(r"[ \t]+,", ",", cleaned)   # URL을 걷어낸 자리의 " ," 정리
    return cleaned.strip(), urls


def sources_of(urls):
    out, seen = [], set()
    for u in urls:
        if u in seen:
            continue
        seen.add(u)
        out.append({"label": host_label(u), "url": u})
    return out


def tidy(value: str) -> str:
    value = value.strip()
    value = re.sub(r"[ \t]+\n", "\n", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def split_sections(lines):
    """[{no, title, lines}] — '## 1.' 형태의 섹션으로 나눈다."""
    sections, cur = [], None
    for line in lines:
        m = re.match(r"^##\s+(\d)\.\s*(.*)$", line)
        if m:
            cur = {"no": int(m.group(1)), "title": m.group(2).strip(), "lines": []}
            sections.append(cur)
        elif cur is not None:
            cur["lines"].append(line)
    return sections


def split_blocks(section_lines):
    """섹션을 '### ' 블록들로 나눈다. '>' 인용 줄은 블록 밖 단신으로 분리한다."""
    pre, blocks, quotes, cur = [], [], [], None
    for line in section_lines:
        if line.startswith("### "):
            if cur:
                blocks.append(cur)
            cur = {"heading": line[4:].strip(), "lines": []}
        elif line.lstrip().startswith(">"):
            quotes.append(line)
        elif cur is not None:
            cur["lines"].append(line)
        else:
            pre.append(line)
    if cur:
        blocks.append(cur)
    return pre, blocks, quotes


def parse_fields(block_lines):
    """아이템 블록의 '- 키: 값' 필드와 들여쓴 하위 불릿을 순서대로 모은다."""
    fields, order, cur = {}, [], None
    for raw in block_lines:
        line = raw.rstrip()
        if not line.strip() or line.strip() in {"---", "***", "___"}:
            continue
        m = re.match(r"^-\s*([^:：]{1,25})[:：]\s*(.*)$", line)
        if m and m.group(1).strip() in KNOWN_KEYS:
            cur = m.group(1).strip()
            if cur not in fields:
                fields[cur] = []
                order.append(cur)
            if m.group(2).strip():
                fields[cur].append(m.group(2).strip())
            continue
        if cur is None:
            continue
        sub = re.match(r"^\s+-\s*(.*)$", line)
        if sub:
            fields[cur].append(sub.group(1).strip())
        elif line.startswith("  "):            # 들여쓴 이어지는 줄
            fields[cur].append(line.strip())
        else:                                   # 필드 사이의 예외적 최상위 줄
            fields[cur].append(line.strip())
    return {k: tidy("\n".join(v)) for k, v in fields.items()}, order


def parse_item(block, category, label, date, no):
    heading = block["heading"]
    title = heading
    if title[:1] in CIRCLED:
        title = title[1:].strip()
    title = re.sub(r"^\(짧게\)\s*", "", title)
    fields, order = parse_fields(block["lines"])

    summary_parts = [fields[k] for k in order if k in CONTENT_KEYS and fields.get(k)]
    summary = "\n".join(summary_parts)
    summary = re.sub(r"^미확인[:：]\s*", "미확인 — ", summary, flags=re.M)

    insight = ""
    for key in INSIGHT_KEYS:
        if fields.get(key):
            insight = fields[key]
            break

    note = fields.get("같은 날짜 클리핑") or fields.get("비고") or fields.get("참고") or ""
    urls = [u.rstrip(TRAIL) for u in URL_RE.findall(fields.get("URL", ""))]

    return {
        "id": f"{date}-{category}-{no}",
        "no": no,
        "category": category,
        "categoryLabel": label,
        "title": title,
        "checked": fields.get("확인된 게시") or fields.get("확인된 시각") or "",
        "summary": summary,
        "whyHot": fields.get("왜 터졌나", ""),
        "insight": insight,
        "note": note,
        "sourceText": tidy(fields.get("출처", "")),
        "sources": sources_of(urls),
    }


def parse_extras(block, block_index):
    """'(짧게)·(참고)' 묶음의 최상위 불릿을 각각 하나의 단신으로 만든다."""
    entries, cur = [], None
    for raw in block["lines"]:
        line = raw.rstrip()
        if not line.strip() or line.startswith(">") or line.strip() in {"---", "***", "___"}:
            continue
        if re.match(r"^-\s+", line):
            if cur:
                entries.append(cur)
            cur = [line]
        elif cur is not None:
            cur.append(line)
    if cur:
        entries.append(cur)

    heading = re.sub(r"^\((짧게|참고)\)\s*", "", block["heading"]).strip()
    heading = re.sub(r"\s*—.*$", "", heading).strip()
    out = []
    for idx, chunk in enumerate(entries):
        text = "\n".join(part.strip() for part in chunk)
        text = re.sub(r"^-\s+", "", text)
        text = re.sub(r"^\s+-\s*", "- ", text, flags=re.M)
        title, body = "", text
        m = re.match(r"^\*\*(.+?)\*\*\s*(?:[:：]\s*)?(.*)$", text, re.S)
        if m:
            title = m.group(1).strip()
            body = re.sub(r"^[—–-]\s*", "", m.group(2).strip())
        body, urls = take_urls(body)
        out.append({
            "id": f"{block_index}-{idx}",
            "title": title,
            "body": tidy(body),
            "sources": sources_of(urls),
        })
    return heading, out


def parse_blockquote_extras(lines):
    out = []
    for line in lines:
        if line.startswith(">"):
            text = line.lstrip("> ").strip()
            title = ""
            m = re.match(r"^(참고|비고|주의)(\([^)]*\))?\s*[:：]\s*(.*)$", text)
            if m:
                title = (m.group(1) + (m.group(2) or "")).strip()
                text = m.group(3)
            body, urls = take_urls(text)
            out.append({"id": "q%d" % len(out), "title": title, "body": tidy(body),
                        "sources": sources_of(urls)})
    return out


def parse_list(lines, ordered=True):
    items, cur = [], None
    for raw in lines:
        line = raw.rstrip()
        if not line.strip():
            continue
        m = re.match(r"^(\d+)\.\s+(.*)$", line) if ordered else re.match(r"^-\s+(.*)$", line)
        if m:
            if cur:
                items.append(cur)
            cur = [m.group(2) if ordered else m.group(1)]
        elif cur is not None:
            cur.append(line.strip())
    if cur:
        items.append(cur)
    return [tidy("\n".join(chunk)) for chunk in items]


def parse_file(path):
    text = open(path, encoding="utf-8").read()
    lines = text.split("\n")
    head = lines[0]
    m = re.search(r"(\d{4})\.(\d{2})\.(\d{2})\((\S)\)", head)
    date = f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    weekday = m.group(4)

    meta, headline = [], ""
    for i, line in enumerate(lines):
        if line.startswith("**오늘의 한 줄:**"):
            chunk = [line]
            for nxt in lines[i + 1:]:
                if not nxt.strip() or nxt.startswith("---") or nxt.startswith("##"):
                    break
                chunk.append(nxt)
            headline = re.sub(r"^\*\*오늘의 한 줄:\*\*\s*", "", "\n".join(chunk)).strip()
            break
        mm = re.match(r"^-\s*([^:：]{1,60})[:：]\s*(.*)$", line)
        if mm:
            label, extra = mm.group(1).strip(), ""
            pm = re.match(r"^([^(]+?)\s*\((.*)\)$", label)
            if pm:
                label, extra = pm.group(1).strip(), pm.group(2).strip()
            meta.append({"label": label, "extra": extra, "value": tidy(mm.group(2))})

    sections = split_sections(lines)
    items, extras, ideas, caveats = [], [], [], []
    for section in sections:
        if section["no"] in CATEGORY_BY_SECTION:
            category, label = CATEGORY_BY_SECTION[section["no"]]
            pre, blocks, quotes = split_blocks(section["lines"])
            no = 0
            for block in blocks:
                if block["heading"][:1] in CIRCLED:
                    no += 1
                    items.append(parse_item(block, category, label, date, no))
                else:
                    heading, entries = parse_extras(block, f"{date}-{category}")
                    for entry in entries:
                        entry["group"] = heading
                    extras.extend(entries)
            for entry in parse_blockquote_extras(quotes):
                entry["group"] = "참고"
                extras.append(entry)
        elif section["no"] == 4:
            ideas = parse_list(section["lines"], ordered=True)
        elif section["no"] == 5:
            caveats = parse_list(section["lines"], ordered=False)

    for idx, entry in enumerate(extras):
        entry["id"] = f"{date}-extra-{idx + 1}"

    return {
        "date": date,
        "weekday": weekday,
        "headline": headline,
        "meta": meta,
        "items": items,
        "extras": extras,
        "ideas": ideas,
        "caveats": caveats,
    }


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser()
    ap.add_argument("--src-dir", default=os.path.abspath(os.path.join(here, "..", "..", "..", "work")))
    ap.add_argument("--out-dir", default=os.path.abspath(os.path.join(here, "..", "data")))
    ap.add_argument("--pattern", default="trend-brief-*.md")
    args = ap.parse_args()

    paths = sorted(glob.glob(os.path.join(args.src_dir, args.pattern)))
    if not paths:
        sys.exit(f"원본 마크다운을 찾지 못했습니다: {args.src_dir}/{args.pattern}")

    briefs = [parse_file(p) for p in paths]
    briefs.sort(key=lambda b: b["date"], reverse=True)

    latest = briefs[0]["date"]
    payload = {
        "updatedAt": f"{latest} 08:00 KST 기준",
        "latestDate": latest,
        "counts": {
            "days": len(briefs),
            "items": sum(len(b["items"]) for b in briefs),
            "extras": sum(len(b["extras"]) for b in briefs),
            "ideas": sum(len(b["ideas"]) for b in briefs),
        },
        "briefs": briefs,
    }

    os.makedirs(args.out_dir, exist_ok=True)
    json_path = os.path.join(args.out_dir, "briefs.json")
    with open(json_path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=1)
        fh.write("\n")

    js_path = os.path.join(args.out_dir, "briefs.js")
    with open(js_path, "w", encoding="utf-8") as fh:
        fh.write("/* 자동 생성 파일 — build_briefs.py가 data/briefs.json에서 만든다.\n")
        fh.write("   file:// 로 열 때 fetch가 막히는 경우를 위한 오프라인 사본. 직접 고치지 말 것. */\n")
        fh.write("window.__BRIEFS__ = ")
        json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))
        fh.write(";\n")

    for b in briefs:
        print(f"{b['date']}({b['weekday']}) 마케팅={sum(1 for i in b['items'] if i['category']=='marketing')}"
              f" 트렌드={sum(1 for i in b['items'] if i['category']=='trend')}"
              f" AI={sum(1 for i in b['items'] if i['category']=='ai')}"
              f" 단신={len(b['extras'])} 아이디어={len(b['ideas'])} 주의={len(b['caveats'])}")
    print(f"합계: {payload['counts']}")
    print(f"저장: {json_path}")


if __name__ == "__main__":
    main()
