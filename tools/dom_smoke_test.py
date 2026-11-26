#!/usr/bin/env python3
"""app.js 스모크 테스트 — 실제 브라우저 대신 최소 DOM을 흉내 내 QuickJS에서 앱을 돌린다.

검사 항목
  1) 기본 진입(최신 날짜) · 카드 수 · 탭/날짜 칩 카운트
  2) 전체 날짜 + 카테고리 필터
  3) 키워드 검색 · 선택 날짜에 결과가 없을 때 전체 날짜 자동 확장
  4) 검색어에 HTML/스크립트를 넣어도 텍스트로만 그려지는지(XSS)
  5) 출처 칩 target/rel, '더 보기' 토글, 빈 결과/에러 화면
  6) 🎀 키티·콜라보 탭 — 카드·전체 사이트 CTA·날짜 숨김·탭 안 검색

기대값은 data/briefs.json 에서 계산한다(브리핑이 하루 늘어도 깨지지 않게).
사용법: python3 site/morning-brief/tools/dom_smoke_test.py
필요: pip install quickjs
"""
import json
import os
import re
import sys

import quickjs

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.abspath(os.path.join(HERE, ".."))
DATA = json.load(open(os.path.join(SITE, "data", "briefs.json"), encoding="utf-8"))
APP = open(os.path.join(SITE, "app.js"), encoding="utf-8").read()

DOM_STUB = r"""
(function () {
  function TextNode(text) { this.nodeType = 3; this.text = String(text); this.parentNode = null; }
  TextNode.prototype.textContent = function () { return this.text; };

  function Node(tag) {
    this.tagName = String(tag || "").toUpperCase();
    this.childNodes = [];
    this.attributes = {};
    this.listeners = {};
    this.id = "";
    this.hidden = false;
    this.type = "";
    this.value = "";
    this.open = false;
    this.parentNode = null;
  }
  ["href", "target", "rel", "src", "type", "name", "content"].forEach(function (prop) {
    Object.defineProperty(Node.prototype, prop, {
      get: function () { return this.attributes[prop] || ""; },
      set: function (v) { this.attributes[prop] = String(v); }
    });
  });
  Node.prototype.appendChild = function (child) {
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  };
  Node.prototype._text = function () {
    var out = "";
    for (var i = 0; i < this.childNodes.length; i++) {
      var c = this.childNodes[i];
      out += (c.nodeType === 3) ? c.text : c._text();
    }
    return out;
  };
  Object.defineProperty(Node.prototype, "textContent", {
    get: function () { return this._text(); },
    set: function (v) { this.childNodes = [new TextNode(v)]; }
  });
  Object.defineProperty(Node.prototype, "className", {
    get: function () { return this.attributes["class"] || ""; },
    set: function (v) { this.attributes["class"] = String(v); }
  });
  Object.defineProperty(Node.prototype, "classList", {
    get: function () {
      var self = this;
      function list() { return (self.attributes["class"] || "").split(/\s+/).filter(Boolean); }
      return {
        add: function (c) { var l = list(); if (l.indexOf(c) < 0) l.push(c); self.attributes["class"] = l.join(" "); },
        remove: function (c) { self.attributes["class"] = list().filter(function (x) { return x !== c; }).join(" "); },
        contains: function (c) { return list().indexOf(c) >= 0; },
        toggle: function (c, force) {
          var has = this.contains(c);
          var want = (force === undefined) ? !has : !!force;
          if (want) this.add(c); else this.remove(c);
          return want;
        }
      };
    }
  });
  Node.prototype.setAttribute = function (k, v) {
    if (k === "class") { this.className = v; return; }
    this.attributes[k] = String(v);
  };
  Node.prototype.getAttribute = function (k) {
    if (k === "class") return this.className;
    return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null;
  };
  Node.prototype.addEventListener = function (type, fn) {
    (this.listeners[type] = this.listeners[type] || []).push(fn);
  };
  Node.prototype.dispatch = function (type, ev) {
    (this.listeners[type] || []).forEach(function (fn) { fn(ev || { type: type, target: this, preventDefault: function () {} }); });
  };
  Node.prototype.getBoundingClientRect = function () { return { top: 0, bottom: 96, left: 0, width: 390 }; };
  Node.prototype.scrollIntoView = function () {};
  Node.prototype.querySelector = function (sel) {
    var m = /^\[([\w-]+)="(.*)"\]$/.exec(sel);
    function walk(node) {
      for (var i = 0; i < node.childNodes.length; i++) {
        var c = node.childNodes[i];
        if (c.nodeType === 3) continue;
        if (m && c.getAttribute(m[1]) === m[2]) return c;
        var found = walk(c);
        if (found) return found;
      }
      return null;
    }
    return walk(this);
  };
  Node.prototype.querySelectorAll = function (sel) {
    var tag = sel.toUpperCase();
    var out = [];
    (function walk(node) {
      for (var i = 0; i < node.childNodes.length; i++) {
        var c = node.childNodes[i];
        if (c.nodeType === 3) continue;
        if (c.tagName === tag) out.push(c);
        walk(c);
      }
    })(this);
    return out;
  };

  var ids = {};
  ["tabs", "dates", "results", "status", "search-input", "search-clear",
   "theme-toggle", "app-header", "filter-bar", "footer-meta", "search-form"].forEach(function (id) {
    var n = new Node(id === "search-input" ? "input" : "div");
    n.id = id;
    ids[id] = n;
  });

  var meta = new Node("meta");
  meta.setAttribute("name", "theme-color");
  meta.setAttribute("content", "#FFFBF9");

  globalThis.document = {
    readyState: "complete",
    documentElement: new Node("html"),
    listeners: {},
    createElement: function (tag) { return new Node(tag); },
    createTextNode: function (t) { return new TextNode(t); },
    querySelector: function (sel) {
      if (sel === 'meta[name="theme-color"]') return meta;
      if (sel.charAt(0) === "#") return ids[sel.slice(1)] || null;
      return null;
    },
    getElementById: function (id) { return ids[id] || null; },
    addEventListener: function (type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  };
  globalThis.__ids = ids;
  globalThis.__meta = meta;

  globalThis.window = {
    scrollY: 0,
    scrollTo: function () {},
    matchMedia: function () { return { matches: false, addEventListener: function () {} }; },
    setTimeout: function (fn) { fn(); return 1; },
    clearTimeout: function () {},
    addEventListener: function () {},
    __BRIEFS__: null
  };
  globalThis.matchMedia = globalThis.window.matchMedia;
  globalThis.localStorage = {
    _d: {},
    getItem: function (k) { return this._d[k] || null; },
    setItem: function (k, v) { this._d[k] = String(v); }
  };
  globalThis.setTimeout = globalThis.window.setTimeout;
  globalThis.clearTimeout = globalThis.window.clearTimeout;
  globalThis.__text = function (node) { return node.nodeType === 3 ? node.text : node._text(); };
  globalThis.__find = function (node, pred, out) {
    out = out || [];
    for (var i = 0; i < node.childNodes.length; i++) {
      var c = node.childNodes[i];
      if (c.nodeType === 3) continue;
      if (pred(c)) out.push(c);
      globalThis.__find(c, pred, out);
    }
    return out;
  };
  globalThis.__hasClass = function (node, cls) {
    return (" " + (node.getAttribute("class") || "") + " ").indexOf(" " + cls + " ") >= 0;
  };
})();
"""

HELPERS = r"""
function drain() {}
globalThis.__cards = function () {
  return globalThis.__find(document.getElementById("results"), function (n) {
    return globalThis.__hasClass(n, "card");
  });
};
globalThis.__chips = function () {
  return globalThis.__find(document.getElementById("results"), function (n) {
    return grand(n, "chip");
  });
};
function grand(n, cls) { return globalThis.__hasClass(n, cls); }
globalThis.__tabs = function () {
  return globalThis.__find(document.getElementById("tabs"), function (n) { return n.tagName === "BUTTON"; });
};
globalThis.__dateChips = function () {
  return globalThis.__find(document.getElementById("dates"), function (n) { return n.tagName === "BUTTON"; });
};
globalThis.__textOf = function (id) {
  return globalThis.__text(document.getElementById(id));
};
globalThis.__byClass = function (cls) {
  return globalThis.__find(document.getElementById("results"), function (n) { return globalThis.__hasClass(n, cls); });
};
"""


def new_context(fetch_mode):
    ctx = quickjs.Context()
    ctx.eval(DOM_STUB)
    ctx.eval(HELPERS)
    payload = json.dumps(DATA, ensure_ascii=False)
    if fetch_mode == "ok":
        ctx.eval("globalThis.fetch = function(){ return Promise.resolve({ ok:true, json:function(){ return Promise.resolve(%s); } }); };" % payload)
    elif fetch_mode == "fallback":
        ctx.eval("globalThis.window.__BRIEFS__ = %s;" % payload)
        ctx.eval("globalThis.fetch = function(){ return Promise.reject(new Error('file:// blocked')); };")
    else:
        ctx.eval("globalThis.fetch = function(){ return Promise.reject(new Error('network down')); };")
    ctx.eval(APP)
    # 마이크로태스크 처리
    for _ in range(60):
        if not ctx.execute_pending_job():
            break
    return ctx


results = []


def check(name, got, want):
    ok = got == want
    results.append(ok)
    print(("  ✓ " if ok else "  ✗ ") + name + ("" if ok else f"  (got {got!r}, want {want!r})"))


def plain(text):
    return str(text or "").replace("**", "")


# ---- 기대값은 실제 데이터에서 계산한다 ----
BRIEFS = DATA["briefs"]                      # 최신순
LATEST_DATE = DATA["latestDate"]
LATEST = next(b for b in BRIEFS if b["date"] == LATEST_DATE)
KITTY = DATA.get("kittyCollabs") or {"items": []}
KITTY_ITEMS = KITTY.get("items") or []


def fmt_date(date):
    return date[5:].replace("-", ".")


def tab_text(counts, kitty_count):
    expected = "전체%d|🔥 국내 화제%d|📊 마케터 뉴스%d|🤖 AI 정보%d" % (
        counts["all"], counts["trend"], counts["marketing"], counts["ai"])
    if KITTY_ITEMS:
        expected += "|🎀 키티·콜라보%d" % kitty_count
    expected += "|🌈 비더레인보우↗"
    return expected


def count_cat(days, cat):
    return sum(1 for d in days for i in d["items"] if i["category"] == cat)


def kitty_hay(item):
    visit = item.get("visit") or {}
    parts = [item.get("title"), item.get("brand"), item.get("status"), item.get("priceLine"),
             item.get("priceNote"), item.get("headline"),
             visit.get("venue"), visit.get("address"), visit.get("period"), visit.get("hours")]
    parts += list(item.get("schedule") or [])
    parts += list(item.get("points") or [])
    for link in item.get("links") or []:
        parts += [link.get("label"), link.get("url")]
    return plain(" ".join(str(p) for p in parts if p)).lower()


print("[1] fetch 경로 · 기본 진입(최신 날짜)")
ctx = new_context("ok")
latest_items = LATEST["items"]
check("latest view cards", ctx.eval("__cards().length"), len(latest_items))
check("status", ctx.eval("__textOf('status')"),
      f"{fmt_date(LATEST_DATE)} {LATEST['weekday']} · 전체 카테고리 · 이슈 {len(latest_items)}건")
check("headline rendered",
      ctx.eval("__textOf('results').indexOf(%s) >= 0" % json.dumps(plain(LATEST["headline"])[:12], ensure_ascii=False)),
      True)
check("tab counts (선택 날짜 기준)", ctx.eval("__tabs().map(function(t){return __text(t)}).join('|')"),
      tab_text({"all": len(latest_items),
                "trend": count_cat([LATEST], "trend"),
                "marketing": count_cat([LATEST], "marketing"),
                "ai": count_cat([LATEST], "ai")},
               len(KITTY_ITEMS)))
check("date chips", ctx.eval("__dateChips().length"), len(BRIEFS) + 1)
check("first card title",
      ctx.eval("__text(__find(__cards()[0], function(n){return __hasClass(n,'card-title')})[0])"),
      plain(latest_items[0]["title"]))
check("chips target blank", ctx.eval("__chips().every(function(c){return c.getAttribute('target')==='_blank' && c.getAttribute('rel').indexOf('noopener')===0;})"), True)
check("chips have href", ctx.eval("__chips().every(function(c){return /^https:\\/\\//.test(c.getAttribute('href')||'');})"), True)
check("insight box present", ctx.eval("__byClass('insight').length"),
      sum(1 for i in latest_items if i.get("insight")))
check("why box present", ctx.eval("__byClass('why').length"),
      sum(1 for i in latest_items if i.get("whyHot")))
check("clamped summary", ctx.eval("__byClass('is-clamped').length > 0"), True)
check("kitty tab shown", ctx.eval("__tabs().length"), 6 if KITTY_ITEMS else 5)

print("[2] '전체 날짜' 클릭 · 카테고리 필터")
ALL_ITEMS = sum(len(b["items"]) for b in BRIEFS)
ctx.eval("__dateChips()[0].dispatch('click')")
check("all dates cards", ctx.eval("__cards().length"), ALL_ITEMS)
check("tab counts (전체 날짜)", ctx.eval("__tabs().map(function(t){return __text(t)}).join('|')"),
      tab_text({"all": ALL_ITEMS,
                "trend": count_cat(BRIEFS, "trend"),
                "marketing": count_cat(BRIEFS, "marketing"),
                "ai": count_cat(BRIEFS, "ai")},
               len(KITTY_ITEMS)))
check("all dates status", ctx.eval("__textOf('status')"),
      f"{len(BRIEFS)}일 전체 · 전체 카테고리 · 이슈 {ALL_ITEMS}건")
check("day sections", ctx.eval("__byClass('day').length"), len(BRIEFS))
ctx.eval("__tabs()[3].dispatch('click')")
check("AI tab cards", ctx.eval("__cards().length"), count_cat(BRIEFS, "ai"))
check("AI tab status", ctx.eval("__textOf('status')"),
      f"{len(BRIEFS)}일 전체 · 🤖 AI 정보 · 이슈 {count_cat(BRIEFS, 'ai')}건")
check("AI tab hides extras/ideas", ctx.eval("__byClass('extras').length + __byClass('ideas').length"), 0)
ctx.eval("__tabs()[1].dispatch('click')")
check("trend tab cards", ctx.eval("__cards().length"), count_cat(BRIEFS, "trend"))

print("[3] 검색 · 날짜 자동 확장")
ctx.eval("__tabs()[0].dispatch('click')")
ctx.eval("__dateChips()[1].dispatch('click')")  # 최신 날짜
check("back to latest", ctx.eval("__cards().length"), len(latest_items))

latest_blob = plain(json.dumps(LATEST, ensure_ascii=False)).lower()
# 최신 날짜에 있는 키워드
kw_in_latest = next(
    tok for item in latest_items
    for tok in re.findall(r"[가-힣]{2,}", item["title"])
    if tok.lower() in latest_blob)
ctx.eval("var i=document.getElementById('search-input'); i.value=%s; i.dispatch('input');"
         % json.dumps(kw_in_latest, ensure_ascii=False))
check("search cards > 0", ctx.eval("__cards().length") > 0, True)
check("search has mark", ctx.eval("__find(document.getElementById('results'), function(n){return n.tagName==='MARK'}).length > 0"), True)
check("search status", ctx.eval("__textOf('status')"),
      f"{fmt_date(LATEST_DATE)} {LATEST['weekday']} · 전체 카테고리 · 검색 결과 {ctx.eval('__cards().length')}건")
check("clear button shown", ctx.eval("document.getElementById('search-clear').hidden"), False)

# 최신 날짜에는 없고 다른 날짜에만 있는 키워드 (자동 확장 확인용)
kw_elsewhere = None
for brief in BRIEFS[1:]:
    for item in brief["items"]:
        for tok in re.findall(r"[가-힣]{3,}", item["title"]):
            if tok not in latest_blob:
                kw_elsewhere = tok
                break
        if kw_elsewhere:
            break
    if kw_elsewhere:
        break
if kw_elsewhere:
    ctx.eval("var i=document.getElementById('search-input'); i.value=%s; i.dispatch('input');"
             % json.dumps(kw_elsewhere, ensure_ascii=False))
    check("auto expand banner", ctx.eval("__byClass('banner').length"), 1)
    check("auto expand finds items", ctx.eval("__cards().length") > 0, True)
    check("expanded status scope", ctx.eval("__textOf('status')").startswith(f"{len(BRIEFS)}일 전체"), True)
else:
    print("  - 자동 확장 검사 건너뜀(다른 날짜에만 있는 키워드 없음)")

ctx.eval("var i=document.getElementById('search-input'); i.value='없는키워드zzz'; i.dispatch('input');")
check("empty state", ctx.eval("__byClass('empty').length"), 1)
check("empty state text", ctx.eval("__textOf('results').indexOf('검색 결과가 없습니다') >= 0"), True)

print("[4] XSS — 검색어/데이터가 텍스트로만 렌더")
payload = "<img src=x onerror=alert(1)><script>window.__pwned=1</script>"
ctx.eval("var i=document.getElementById('search-input'); i.value=%s; i.dispatch('input');" % json.dumps(payload))
check("no img element", ctx.eval("__find(document.getElementById('results'), function(n){return n.tagName==='IMG'}).length"), 0)
check("no script element", ctx.eval("__find(document.getElementById('results'), function(n){return n.tagName==='SCRIPT'}).length"), 0)
check("no pwn", ctx.eval("typeof window.__pwned"), "undefined")
check("payload kept as text", ctx.eval("__textOf('results').indexOf('onerror=alert(1)') >= 0"), True)

print("[5] '더 보기' 토글 · fallback · 에러 화면")
ctx.eval("var i=document.getElementById('search-input'); i.value=''; i.dispatch('input');")
ctx.eval("__dateChips()[1].dispatch('click')")
before = ctx.eval("__byClass('is-clamped').length")
check("clamped before", before > 0, True)
ctx.eval("var b=__byClass('more-btn')[0]; b.dispatch('click');")
after = ctx.eval("__byClass('is-clamped').length")
check("clamp toggles one card open", after, before - 1)
check("button label flipped", ctx.eval("__text(__byClass('more-btn')[0]).indexOf('접기') >= 0"), True)
ctx.eval("var b=__byClass('more-btn')[0]; b.dispatch('click');")
check("clamp toggles back", ctx.eval("__byClass('is-clamped').length"), before)

ctx2 = new_context("fallback")
check("fallback cards", ctx2.eval("__cards().length"), len(latest_items))
check("fallback footer",
      ctx2.eval("__textOf('footer-meta')").startswith(f"{len(BRIEFS)}일치 · 이슈 {ALL_ITEMS}건"), True)

ctx3 = new_context("fail")
check("error state", ctx3.eval("__byClass('error').length"), 1)
check("error mentions path", ctx3.eval("__textOf('results').indexOf('briefs.json') >= 0"), True)
check("error status", ctx3.eval("__textOf('status')"), "데이터 없음")

print("[6] 🎀 키티·콜라보 탭")
if KITTY_ITEMS:
    ctx.eval("__tabs()[4].dispatch('click')")
    check("kitty cards", ctx.eval("__cards().length"), len(KITTY_ITEMS))
    check("dates hidden", ctx.eval("document.getElementById('dates').hidden"), True)
    check("kitty status", ctx.eval("__textOf('status')"),
          f"{KITTY.get('asOf', '')} 기준 · 🎀 산리오(헬로키티) · 콜라보 {len(KITTY_ITEMS)}건")
    check("kitty titles", ctx.eval("__byClass('card-title').map(function(n){return __text(n)}).join('|')"),
          "|".join(plain(i["title"]) for i in KITTY_ITEMS))
    check("kitty has price rows", ctx.eval("__byClass('kitty-row').length >= %d" % (len(KITTY_ITEMS) * 2)), True)
    check("kitty status pills", ctx.eval("__byClass('kitty-status').length"), len(KITTY_ITEMS))
    check("kitty two CTAs", ctx.eval("__byClass('kitty-cta').length"), 2)
    check("kitty CTA url", ctx.eval("__byClass('kitty-cta').every(function(a){return a.getAttribute('href')===%s;})"
                                    % json.dumps(KITTY.get("siteUrl"), ensure_ascii=False)), True)
    check("kitty CTA label", ctx.eval("__text(__byClass('kitty-cta')[0]).indexOf('8대 캐릭터 콜라보 전체 사이트') >= 0"), True)
    check("kitty CTA new tab", ctx.eval("__byClass('kitty-cta').every(function(a){return a.getAttribute('target')==='_blank' && a.getAttribute('rel').indexOf('noopener')===0;})"), True)

    kitty_kw = "스타벅스"
    ctx.eval("var i=document.getElementById('search-input'); i.value=%s; i.dispatch('input');" % json.dumps(kitty_kw, ensure_ascii=False))
    matched = [i for i in KITTY_ITEMS if kitty_kw.lower() in kitty_hay(i)]
    check("kitty search cards", ctx.eval("__cards().length"), len(matched))
    check("kitty search status", ctx.eval("__textOf('status')").endswith(f"검색 결과 {len(matched)}건"), True)
    check("kitty search keeps CTA", ctx.eval("__byClass('kitty-cta').length"), 2)

    ctx.eval("var i=document.getElementById('search-input'); i.value=''; i.dispatch('input');")
    ctx.eval("__tabs()[0].dispatch('click')")
    check("back to brief tab", ctx.eval("__cards().length"), len(latest_items))
    check("dates visible again", ctx.eval("document.getElementById('dates').hidden"), False)
else:
    print("  - kittyCollabs 데이터가 없어 건너뜀")

print("[7] 🌈 비더레인보우 연결 칸")
RAINBOW_URL = "https://everythingtokitty-house.github.io/everythingtokitty--house.github.io/berainbow/"
rainbow_idx = ctx.eval(
    "__tabs().findIndex(function(t){ return __text(t).indexOf('비더레인보우') >= 0; })")
check("rainbow tab exists", rainbow_idx >= 0, True)
check("rainbow tab label", ctx.eval("__text(__tabs()[%d])" % rainbow_idx), "🌈 비더레인보우↗")
ctx.eval("__tabs()[%d].dispatch('click')" % rainbow_idx)
check("rainbow tab pressed", ctx.eval("__tabs()[%d].getAttribute('aria-pressed')" % rainbow_idx), "true")
check("rainbow hides date chips", ctx.eval("document.getElementById('dates').hidden"), True)
check("rainbow status", ctx.eval("__textOf('status')"), "🌈 비더레인보우 · 사업 대시보드 바로가기")
check("rainbow 3줄 요약", ctx.eval("__byClass('rainbow-points')[0].childNodes.length"), 3)
rainbow_text = ctx.eval("__textOf('results')")
for needle in ["품절 7 / 14 정리", "페를레 로켓그로스 단독", "매주 금요일 업데이트"]:
    check("rainbow summary: " + needle, needle in rainbow_text, True)
cta_href = ctx.eval("__byClass('rainbow-cta')[0].getAttribute('href')")
check("rainbow CTA url", cta_href, RAINBOW_URL)
check("rainbow CTA label", "비더레인보우 운영 대시보드 열기" in ctx.eval("__text(__byClass('rainbow-cta')[0])"), True)
check("rainbow CTA new tab",
      ctx.eval("__byClass('rainbow-cta')[0].getAttribute('target') === '_blank' && "
               "__byClass('rainbow-cta')[0].getAttribute('rel').indexOf('noopener') === 0"), True)
check("rainbow no briefing cards", ctx.eval("__cards().length"), 0)
ctx.eval("__tabs()[0].dispatch('click')")
check("leave rainbow -> dates visible", ctx.eval("document.getElementById('dates').hidden"), False)
check("leave rainbow -> cards back", ctx.eval("__cards().length"), len(latest_items))
# rainbow 탭에서 검색을 시작하면 브리핑 탭으로 자동 전환
ctx.eval("__tabs()[%d].dispatch('click')" % rainbow_idx)
ctx.eval("var i=document.getElementById('search-input'); i.value='청룡'; i.dispatch('input');")
check("search from rainbow -> rainbow tab off",
      ctx.eval("__tabs()[%d].getAttribute('aria-pressed')" % rainbow_idx), "false")
check("search from rainbow -> results", ctx.eval("__cards().length > 0"), True)
ctx.eval("var i=document.getElementById('search-input'); i.value=''; i.dispatch('input');")

if "--dump" in sys.argv:
    ctx.eval("var i=document.getElementById('search-input'); i.value=''; i.dispatch('input');")
    ctx.eval("__dateChips()[1].dispatch('click')")
    print("\n=== 최신 날짜 렌더 텍스트 (앞부분) ===")
    print(ctx.eval("__textOf('results')")[:3000])
    if KITTY_ITEMS:
        ctx.eval("__tabs()[4].dispatch('click')")
        print("\n=== 키티·콜라보 렌더 텍스트 ===")
        print(ctx.eval("__textOf('results')")[:4000])

print()
if all(results):
    print(f"✅ 스모크 테스트 통과 ({len(results)}개 검사)")
else:
    print(f"❌ 실패 {results.count(False)}건 / {len(results)}")
    sys.exit(1)
