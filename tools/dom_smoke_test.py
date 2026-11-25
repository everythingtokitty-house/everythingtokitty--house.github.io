#!/usr/bin/env python3
"""app.js 스모크 테스트 — 실제 브라우저 대신 최소 DOM을 흉내 내 QuickJS에서 앱을 돌린다.

검사 항목
  1) 기본 진입(최신 날짜) · 카드 수 · 탭/날짜 칩 카운트
  2) 전체 날짜 + 카테고리 필터
  3) 키워드 검색 · 선택 날짜에 결과가 없을 때 전체 날짜 자동 확장
  4) 검색어에 HTML/스크립트를 넣어도 텍스트로만 그려지는지(XSS)
  5) 출처 칩 target/rel, '더 보기' 토글, 빈 결과/에러 화면

사용법: python3 site/morning-brief/tools/dom_smoke_test.py
필요: pip install quickjs
"""
import json
import os
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


def textof(ctx, expr):
    return ctx.eval(expr)


results = []


def check(name, got, want):
    ok = got == want
    results.append(ok)
    print(("  ✓ " if ok else "  ✗ ") + name + ("" if ok else f"  (got {got!r}, want {want!r})"))


print("[1] fetch 경로 · 기본 진입(최신 날짜)")
ctx = new_context("ok")
check("latest view cards", ctx.eval("__cards().length"), 9)
check("status", ctx.eval("__textOf('status')"), "11.25 수 · 전체 카테고리 · 이슈 9건")
check("headline rendered", ctx.eval("__textOf('results').indexOf('어제의 랠리는') >= 0"), True)
check("tab counts (선택 날짜 기준)", ctx.eval("__tabs().map(function(t){return __text(t)}).join('|')"),
      "전체9|🔥 국내 화제3|📊 마케터 뉴스3|🤖 AI 정보3")
check("date chips", ctx.eval("__dateChips().length"), 6)
check("first card title", ctx.eval("__cards()[0].querySelector ? __text(__find(__cards()[0], function(n){return __hasClass(n,'card-title')})[0]) : ''"),
      "'남의 결혼식 버진로드' — 유튜브 폭로 하루 만에 당사자 사과, 하객 브이로그가 증거가 됐다")
check("chips target blank", ctx.eval("__chips().every(function(c){return c.getAttribute('target')==='_blank' && c.getAttribute('rel').indexOf('noopener')===0;})"), True)
check("chips have href", ctx.eval("__chips().every(function(c){return /^https:\\/\\//.test(c.getAttribute('href')||'');})"), True)
check("insight box present", ctx.eval("__find(document.getElementById('results'), function(n){return __hasClass(n,'insight')}).length"), 9)
check("why box present (11.25는 3건)", ctx.eval("__find(document.getElementById('results'), function(n){return __hasClass(n,'why')}).length"), 3)
check("clamped summary", ctx.eval("__find(document.getElementById('results'), function(n){return __hasClass(n,'is-clamped')}).length > 0"), True)

print("[2] '전체 날짜' 클릭 · 카테고리 필터")
ctx.eval("__dateChips()[0].dispatch('click')")
check("all dates cards", ctx.eval("__cards().length"), 51)
check("tab counts (전체 날짜)", ctx.eval("__tabs().map(function(t){return __text(t)}).join('|')"), "전체51|🔥 국내 화제16|📊 마케터 뉴스19|🤖 AI 정보16")
check("all dates status", ctx.eval("__textOf('status')"), "5일 전체 · 전체 카테고리 · 이슈 51건")
check("5 day sections", ctx.eval("__find(document.getElementById('results'), function(n){return __hasClass(n,'day')}).length"), 5)
ctx.eval("__tabs()[3].dispatch('click')")
check("AI tab cards", ctx.eval("__cards().length"), 16)
check("AI tab status", ctx.eval("__textOf('status')"), "5일 전체 · 🤖 AI 정보 · 이슈 16건")
check("AI tab hides extras/ideas", ctx.eval("__find(document.getElementById('results'), function(n){return __hasClass(n,'extras')||__hasClass(n,'ideas')}).length"), 0)
ctx.eval("__tabs()[1].dispatch('click')")
check("trend tab cards", ctx.eval("__cards().length"), 16)

print("[3] 검색 · 날짜 자동 확장")
ctx.eval("__tabs()[0].dispatch('click')")
ctx.eval("__dateChips()[1].dispatch('click')")  # 11.25
check("back to 11.25", ctx.eval("__cards().length"), 9)
ctx.eval("var i=document.getElementById('search-input'); i.value='배민'; i.dispatch('input');")
check("search 배민 cards", ctx.eval("__cards().length"), 1)
check("search 배민 has mark", ctx.eval("__find(document.getElementById('results'), function(n){return n.tagName==='MARK'}).length > 0"), True)
check("search status", ctx.eval("__textOf('status')"), "11.25 수 · 전체 카테고리 · 검색 결과 1건")
check("clear button shown", ctx.eval("document.getElementById('search-clear').hidden"), False)
ctx.eval("var i=document.getElementById('search-input'); i.value='리만'; i.dispatch('input');")
check("auto expand banner", ctx.eval("__find(document.getElementById('results'), function(n){return __hasClass(n,'banner')}).length"), 1)
check("auto expand cards", ctx.eval("__cards().length"), 1)
check("expanded status scope", "5일 전체" in ctx.eval("__textOf('status')"), True)
ctx.eval("var i=document.getElementById('search-input'); i.value='없는키워드zzz'; i.dispatch('input');")
check("empty state", ctx.eval("__find(document.getElementById('results'), function(n){return __hasClass(n,'empty')}).length"), 1)
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
before = ctx.eval("__find(document.getElementById('results'), function(n){return __hasClass(n,'is-clamped')}).length")
check("clamped before", before > 0, True)
ctx.eval("var b=__find(document.getElementById('results'), function(n){return __hasClass(n,'more-btn')})[0]; b.dispatch('click');")
after = ctx.eval("__find(document.getElementById('results'), function(n){return __hasClass(n,'is-clamped')}).length")
check("clamp toggles one card open", after, before - 1)
check("button label flipped", ctx.eval("__text(__find(document.getElementById('results'), function(n){return __hasClass(n,'more-btn')})[0]).indexOf('접기') >= 0"), True)
ctx.eval("var b=__find(document.getElementById('results'), function(n){return __hasClass(n,'more-btn')})[0]; b.dispatch('click');")
check("clamp toggles back", ctx.eval("__find(document.getElementById('results'), function(n){return __hasClass(n,'is-clamped')}).length"), before)

ctx2 = new_context("fallback")
check("fallback cards", ctx2.eval("__cards().length"), 9)
check("fallback footer", ctx2.eval("__textOf('footer-meta')").startswith("5일치 · 이슈 51건"), True)

ctx3 = new_context("fail")
check("error state", ctx3.eval("__find(document.getElementById('results'), function(n){return __hasClass(n,'error')}).length"), 1)
check("error mentions path", ctx3.eval("__textOf('results').indexOf('briefs.json') >= 0"), True)
check("error status", ctx3.eval("__textOf('status')"), "데이터 없음")

if "--dump" in sys.argv:
    ctx.eval("var i=document.getElementById('search-input'); i.value=''; i.dispatch('input');")
    ctx.eval("__dateChips()[1].dispatch('click')")
    print("\n=== 11.25 렌더 텍스트 (앞부분) ===")
    text = ctx.eval("__textOf('results')")
    print(text[:3000])
    print("\n=== 첫 카드 태그 구조 ===")
    print(ctx.eval("""(function(){
      var out = [];
      (function walk(n, d) {
        for (var i = 0; i < n.childNodes.length; i++) {
          var c = n.childNodes[i];
          if (c.nodeType === 3) continue;
          out.push(new Array(d + 1).join("  ") + "<" + c.tagName.toLowerCase() +
            (c.getAttribute("class") ? " class=" + c.getAttribute("class") : "") + ">");
          walk(c, d + 1);
        }
      })(__cards()[0], 0);
      return out.join(String.fromCharCode(10));
    })()"""))

print()
if all(results):
    print(f"✅ 스모크 테스트 통과 ({len(results)}개 검사)")
else:
    print(f"❌ 실패 {results.count(False)}건 / {len(results)}")
    sys.exit(1)
