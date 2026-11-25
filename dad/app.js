/* 아빠 전용 투자 · 부동산 브리핑 — 렌더링/검색/탭
   순수 바닐라 JS, 빌드 없음. 데이터는 ./data/dad-briefs.json 을 fetch하고,
   file:// 로 열어 fetch가 막히면 data/dad-briefs.js 의 window.__DAD_BRIEFS__ 로 대체한다.
   모든 사용자 데이터는 textNode로만 그린다(innerHTML 미사용). */
(function () {
  "use strict";

  var CATS = [
    { key: "all", label: "전체" },
    { key: "coin", label: "코인", emoji: "🪙" },
    { key: "stock", label: "주식", emoji: "📈" },
    { key: "realestate", label: "부동산 · 우리집", emoji: "🏠" }
  ];
  var THEME_KEY = "dad-brief-theme";

  var els = {};
  var data = null;
  var state = { cat: "all", q: "", invDate: null, reDate: null };

  /* ---------------- helpers ---------------- */
  function $(sel) { return document.querySelector(sel); }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  function getTerms() {
    return state.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  }

  function plain(text) { return String(text || "").replace(/\*\*/g, ""); }

  var URL_RE = /https?:\/\/[^\s<>"')\]]+/g;

  function appendMarked(parent, text, terms) {
    var pieces = String(text).split("\n");
    for (var p = 0; p < pieces.length; p++) {
      if (p) parent.appendChild(document.createElement("br"));
      var chunk = pieces[p];
      if (!chunk) continue;
      if (!terms || !terms.length) {
        parent.appendChild(document.createTextNode(chunk));
        continue;
      }
      var sorted = terms.slice().sort(function (a, b) { return b.length - a.length; });
      var re = new RegExp("(" + sorted.map(escapeRe).join("|") + ")", "gi");
      var parts = chunk.split(re);
      for (var i = 0; i < parts.length; i++) {
        if (!parts[i]) continue;
        if (i % 2 === 1) {
          var mark = document.createElement("mark");
          mark.textContent = parts[i];
          parent.appendChild(mark);
        } else {
          parent.appendChild(document.createTextNode(parts[i]));
        }
      }
    }
  }

  function appendText(parent, text, terms) {
    var last = 0, m;
    URL_RE.lastIndex = 0;
    while ((m = URL_RE.exec(text)) !== null) {
      if (m.index > last) appendMarked(parent, text.slice(last, m.index), terms);
      var url = m[0], trail = "";
      while (url && /[.,;:!?]/.test(url.charAt(url.length - 1))) {
        trail = url.charAt(url.length - 1) + trail;
        url = url.slice(0, -1);
      }
      var a = el("a", "inline-link", url);
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      parent.appendChild(a);
      if (trail) parent.appendChild(document.createTextNode(trail));
      last = m.index + m[0].length;
    }
    if (last < text.length) appendMarked(parent, text.slice(last), terms);
  }

  function inline(parent, text, terms) {
    var parts = String(text).split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];
      if (!part) continue;
      if (part.length > 4 && part.slice(0, 2) === "**" && part.slice(-2) === "**") {
        var strong = document.createElement("strong");
        appendText(strong, part.slice(2, -2), terms);
        parent.appendChild(strong);
      } else if (part.length > 2 && part.charAt(0) === "*" && part.charAt(part.length - 1) === "*"
                 && part.charAt(1) !== "*") {
        var em = document.createElement("em");
        appendText(em, part.slice(1, -1), terms);
        parent.appendChild(em);
      } else {
        appendText(parent, part, terms);
      }
    }
  }

  function fmtWon(v) {
    if (v == null) return "";
    var eok = Math.floor(v / 10000), man = v % 10000;
    var s = "";
    if (eok) s += eok + "억 ";
    if (man) s += man.toLocaleString("ko-KR") + "만";
    return (s.trim() || "0") + " 원";
  }

  /* ---------------- data ---------------- */
  function currentInvest() {
    if (!data || !data.invest || !data.invest.length) return null;
    for (var i = 0; i < data.invest.length; i += 1) {
      if (data.invest[i].date === state.invDate) return data.invest[i];
    }
    return data.invest[0];
  }

  function currentRe() {
    if (!data || !data.realestate || !data.realestate.length) return null;
    for (var i = 0; i < data.realestate.length; i += 1) {
      if (data.realestate[i].date === state.reDate) return data.realestate[i];
    }
    return data.realestate[0];
  }

  function loadData() {
    return fetch("./data/dad-briefs.json", { cache: "no-cache" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .catch(function () {
        if (window.__DAD_BRIEFS__) return window.__DAD_BRIEFS__;
        throw new Error("데이터를 불러오지 못했습니다.");
      });
  }

  /* ---------------- theme ---------------- */
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    var btn = els.themeToggle;
    if (btn) {
      btn.textContent = theme === "dark" ? "☀️" : "🌙";
      btn.setAttribute("aria-label", theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환");
    }
  }

  function initTheme() {
    var saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch (e) { saved = null; }
    if (!saved) {
      saved = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    applyTheme(saved);
    els.themeToggle.addEventListener("click", function () {
      var next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      applyTheme(next);
      try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* noop */ }
    });
  }

  /* ---------------- block rendering ---------------- */
  function renderTable(tbl, terms) {
    var wrap = el("div", "tbl-wrap");
    var table = el("table", "tbl");
    if (tbl.head && tbl.head.length) {
      var thead = el("thead");
      var trh = el("tr");
      tbl.head.forEach(function (h) {
        var th = el("th");
        inline(th, h, terms);
        trh.appendChild(th);
      });
      thead.appendChild(trh);
      table.appendChild(thead);
    }
    var tbody = el("tbody");
    (tbl.rows || []).forEach(function (row) {
      var tr = el("tr");
      row.forEach(function (cell) {
        var td = el("td");
        inline(td, cell, terms);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  function renderBlocks(container, blocks, terms) {
    (blocks || []).forEach(function (b) {
      if (b.t === "h") {
        var h = el(b.level >= 4 ? "h5" : "h4", "doc-h");
        inline(h, b.text, terms);
        container.appendChild(h);
      } else if (b.t === "p") {
        var p = el("p", "doc-p");
        inline(p, b.text, terms);
        container.appendChild(p);
      } else if (b.t === "ul" || b.t === "ol") {
        var list = el(b.t === "ol" ? "ol" : "ul", "doc-list" + (b.t === "ol" ? " doc-list--ol" : ""));
        (b.items || []).forEach(function (it) {
          var li = el("li", it.depth ? "is-sub" : null);
          inline(li, it.text, terms);
          list.appendChild(li);
        });
        container.appendChild(list);
      } else if (b.t === "task") {
        var cl = el("ul", "doc-tasks");
        (b.items || []).forEach(function (it) {
          var li = el("li");
          var box = el("span", "task-box", it.checked ? "✓" : "");
          li.appendChild(box);
          var body = el("span", "task-text");
          inline(body, it.text, terms);
          li.appendChild(body);
          cl.appendChild(li);
        });
        container.appendChild(cl);
      } else if (b.t === "table") {
        container.appendChild(renderTable(b, terms));
      }
    });
  }

  function textOf(value) {
    if (value == null) return "";
    if (typeof value === "string") return plain(value);
    if (Array.isArray(value)) {
      return value.map(textOf).join(" ");
    }
    if (typeof value === "object") {
      var out = [];
      Object.keys(value).forEach(function (k) { out.push(textOf(value[k])); });
      return out.join(" ");
    }
    return String(value);
  }

  function readHash() {
    try {
      var h = String(window.location.hash || "").replace(/^#/, "");
      for (var i = 0; i < CATS.length; i += 1) {
        if (CATS[i].key === h) return h;
      }
    } catch (e) { /* location 없는 환경(테스트) */ }
    return null;
  }

  function writeHash(key) {
    try {
      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, "", "#" + key);
      }
    } catch (e) { /* noop */ }
  }

  /* ---------------- header pieces ---------------- */
  function renderTabs() {
    els.tabs.textContent = "";
    var counts = countByCat();
    CATS.forEach(function (cat) {
      var btn = el("button", "tab");
      btn.type = "button";
      btn.setAttribute("aria-pressed", state.cat === cat.key ? "true" : "false");
      if (cat.emoji) {
        var em = el("span", "tab-emoji", cat.emoji);
        em.setAttribute("aria-hidden", "true");
        btn.appendChild(em);
      }
      btn.appendChild(el("span", null, cat.label));
      if (counts[cat.key]) btn.appendChild(el("span", "count", String(counts[cat.key])));
      btn.addEventListener("click", function () {
        state.cat = cat.key;
        state.q = "";
        els.searchInput.value = "";
        els.searchClear.hidden = true;
        writeHash(cat.key);
        render();
      });
      els.tabs.appendChild(btn);
    });
  }

  function renderDates() {
    els.dates.textContent = "";
    var isRe = state.cat === "realestate";
    var docs = isRe ? (data.realestate || []) : (data.invest || []);
    var active = isRe ? state.reDate : state.invDate;
    docs.forEach(function (doc) {
      var btn = el("button", "date-chip");
      btn.type = "button";
      var label = doc.date.slice(5).replace("-", ".");
      btn.setAttribute("aria-pressed", (active ? active === doc.date : docs[0].date === doc.date) ? "true" : "false");
      btn.appendChild(el("span", null, (isRe ? "🏠 " : "") + label + " " + doc.weekday));
      btn.addEventListener("click", function () {
        if (isRe) state.reDate = doc.date;
        else state.invDate = doc.date;
        render();
      });
      els.dates.appendChild(btn);
    });
    els.dates.hidden = docs.length < 2;
  }

  function countByCat() {
    var inv = currentInvest(), re = currentRe();
    var counts = { all: 0, coin: 0, stock: 0, realestate: 0 };
    if (inv) {
      inv.groups.forEach(function (g) {
        if (g.key === "coin" || g.key === "stock") counts[g.key] += g.subs.length;
      });
    }
    if (re) {
      counts.realestate += re.details.length + re.compare.cards.length + re.news.length + 2;
    }
    counts.all = counts.coin + counts.stock + counts.realestate;
    return counts;
  }

  /* ---------------- 전체 ---------------- */
  function rowsFor(tbl, labels) {
    var out = [];
    if (!tbl) return out;
    (tbl.rows || []).forEach(function (row) {
      if (labels.indexOf(plain(row[0])) >= 0) out.push(row);
    });
    return out;
  }

  function firstBullet(groupKey, subMatch) {
    var inv = currentInvest();
    if (!inv) return "";
    for (var i = 0; i < inv.groups.length; i += 1) {
      var g = inv.groups[i];
      if (g.key !== groupKey) continue;
      for (var j = 0; j < g.subs.length; j += 1) {
        var s = g.subs[j];
        if (subMatch && s.title.indexOf(subMatch) < 0) continue;
        for (var k = 0; k < s.blocks.length; k += 1) {
          var b = s.blocks[k];
          if (b.t === "ul" && b.items.length) return b.items[0].text;
        }
      }
    }
    return "";
  }

  function summaryCard(title, emoji, lines, catKey, viewLabel) {
    var card = el("section", "summary-panel");
    var head = el("div", "summary-head");
    head.appendChild(el("span", "summary-emoji", emoji));
    head.appendChild(el("h3", "summary-title", title));
    var go = el("button", "summary-go", viewLabel || "자세히 →");
    go.type = "button";
    go.addEventListener("click", function () { state.cat = catKey; render(); });
    head.appendChild(go);
    card.appendChild(head);
    var body = el("div", "summary-body");
    lines.forEach(function (line) {
      var row = el("div", "summary-line");
      inline(row, line, []);
      body.appendChild(row);
    });
    card.appendChild(body);
    return card;
  }

  function renderAll() {
    var inv = currentInvest(), re = currentRe();
    var frag = document.createDocumentFragment();

    if (inv && inv.overview && inv.overview.table) {
      var ov = el("section", "ov-card");
      var ovHead = el("div", "ov-head");
      ovHead.appendChild(el("span", "ov-badge", "📌 한눈에"));
      ovHead.appendChild(el("span", "ov-date", inv.date.replace(/-/g, ".") + " (" + inv.weekday + ") 장 마감"));
      ov.appendChild(ovHead);
      ov.appendChild(renderTable(inv.overview.table, []));
      if (inv.overview.keyLine) {
        var kp = el("div", "insight");
        kp.appendChild(el("span", "insight-label", "핵심 한 줄"));
        var kb = el("div");
        inline(kb, inv.overview.keyLine.replace(/^핵심 한 줄:\s*/, ""), []);
        kp.appendChild(kb);
        ov.appendChild(kp);
      }
      frag.appendChild(ov);
    }

    var panels = el("div", "summary-grid");
    if (inv) {
      var coinRows = rowsFor(inv.overview && inv.overview.table, ["비트코인", "심리"]);
      var coinLines = ["**" + plain(coinRows[0] ? coinRows[0][0] : "코인") + "** " + (coinRows[0] ? coinRows[0][1] : "")];
      if (coinRows[1]) coinLines.push("심리 " + coinRows[1][1] + " · " + coinRows[1][3]);
      var coinChk = firstBullet("coin", "체크 포인트");
      if (coinChk) coinLines.push(coinChk);
      panels.appendChild(summaryCard("오늘의 코인", "🪙", coinLines, "coin", "코인 전체 →"));

      var stRows = rowsFor(inv.overview && inv.overview.table, ["코스피", "코스닥"]);
      var stLines = [];
      stRows.forEach(function (r) { stLines.push("**" + plain(r[0]) + "** " + r[1] + " · " + r[3]); });
      var stChk = firstBullet("stock", "체크 포인트");
      if (stChk) stLines.push(stChk);
      panels.appendChild(summaryCard("오늘의 주식", "📈", stLines, "stock", "주식 전체 →"));
    }
    if (re) {
      var h = re.home, lis = re.listing;
      var reLines = [];
      reLines.push("**" + h.name + "** · " + (h.pyeong || "") + " " + (h.exclusiveArea || "") + " · " + (h.floor || "") + (h.facing ? " " + h.facing : ""));
      reLines.push("목표 **" + fmtWon(h.target) + "** / 최소 마지노선 **" + fmtWon(h.minValue) + "** · 12개월 실거래 " + ((lis.market && lis.market["12개월 매매"]) ? lis.market["12개월 매매"].replace("14건, ", "") : "") + "");
      reLines.push("34평 매물 **" + (lis.listings34 || "92") + "건**(" + (lis.ratio34 || "24.7%") + ") 경쟁 중 · 조회 " + (lis.perf.views || "") + " · 관심 " + (lis.perf.interests || "") + " · 채팅 " + (lis.perf.chats || ""));
      panels.appendChild(summaryCard("우리집 부동산", "🏠", reLines, "realestate", "부동산 리포트 →"));
    }
    frag.appendChild(panels);

    if (re && re.summary && re.summary.length) {
      var three = el("section", "three-card");
      three.appendChild(el("h3", "block-title", "부동산 3줄 요약"));
      var ol = el("ol", "three-list");
      re.summary.forEach(function (t) {
        var li = el("li");
        inline(li, t, []);
        ol.appendChild(li);
      });
      three.appendChild(ol);
      frag.appendChild(three);
    }

    if (inv) {
      var closing = null;
      inv.groups.forEach(function (g) { if (g.key === "closing") closing = g; });
      if (closing) {
        var c = el("section", "doc-card");
        var ch = el("div", "doc-head");
        ch.appendChild(el("span", "doc-badge", "🧾 정리"));
        ch.appendChild(el("h3", "doc-title", "아버님께 한 줄 정리"));
        c.appendChild(ch);
        var body = el("div", "doc-body");
        renderBlocks(body, closing.blocks, []);
        c.appendChild(body);
        frag.appendChild(c);
      }
    }

    els.view.appendChild(frag);
  }

  /* ---------------- 코인 / 주식 ---------------- */
  function renderInvestDoc(kind) {
    var inv = currentInvest();
    if (!inv) return;
    var frag = document.createDocumentFragment();

    var head = el("section", "doc-hero");
    head.appendChild(el("p", "doc-kicker", inv.date.replace(/-/g, ".") + " (" + inv.weekday + ") 기준"));
    var h = el("h2", "doc-hero-title", inv.title);
    head.appendChild(h);
    if (inv.stamp) head.appendChild(el("p", "doc-stamp", inv.stamp));
    if (inv.notice) head.appendChild(el("p", "doc-notice", inv.notice));
    frag.appendChild(head);

    var count = 0;
    inv.groups.forEach(function (g) {
      if (g.key !== kind) return;
      g.subs.forEach(function (s, idx) {
        count += 1;
        var card = el("section", "doc-card");
        card.id = "sec-" + g.key + "-" + (s.num || idx);
        var ch = el("div", "doc-head");
        ch.appendChild(el("span", "doc-badge", g.emoji + " " + g.label));
        ch.appendChild(el("span", "doc-no", s.num || String(idx + 1)));
        card.appendChild(ch);
        var h3 = el("h3", "doc-title");
        inline(h3, s.title, []);
        card.appendChild(h3);
        var body = el("div", "doc-body");
        renderBlocks(body, s.blocks, []);
        card.appendChild(body);
        frag.appendChild(card);
      });
    });
    if (!count) frag.appendChild(el("p", "empty-body", "이 날짜에는 해당 섹션이 없습니다."));
    els.view.appendChild(frag);
  }

  /* ---------------- 부동산 ---------------- */
  function homeCard(re) {
    var h = re.home, lis = re.listing;
    var card = el("section", "home-card");
    var head = el("div", "home-head");
    head.appendChild(el("span", "home-badge", "🏠 우리집"));
    head.appendChild(el("h2", "home-title", h.name));
    if (h.address) head.appendChild(el("p", "home-addr", h.address));
    card.appendChild(head);

    var chips = el("ul", "spec-chips");
    (h.specs || []).forEach(function (s) {
      var li = el("li", "spec-chip");
      inline(li, s, []);
      chips.appendChild(li);
    });
    card.appendChild(chips);

    var caveat = el("p", "home-caveat");
    caveat.appendChild(document.createTextNode("※ 타입은 111A 추정 — 정확한 타입·향·조망 각도는 등기·관리사무소·배치도 확인이 필요합니다. "));
    var limitsBtn = el("button", "home-caveat-link", "확인 한계 보기");
    limitsBtn.type = "button";
    limitsBtn.addEventListener("click", function () {
      var node = document.getElementById("sec-re-9");
      if (node) {
        node.open = true;
        node.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
    caveat.appendChild(limitsBtn);
    card.appendChild(caveat);

    // 가격 3단계 밴드
    var band = el("div", "price-band");
    var items = [
      { cls: "pb--min", label: "최소 마지노선", value: fmtWon(h.minValue), note: "이 아래로는 내리지 않기" },
      { cls: "pb--mid", label: "조정 구간", value: "3억 8,000~3억 8,500만", note: "2안 · 15일 시험 후" },
      { cls: "pb--target", label: "목표 매도가", value: fmtWon(h.target), note: "1안 · 유지 + 매물 리뉴얼" }
    ];
    items.forEach(function (it) {
      var box = el("div", "pb " + it.cls);
      box.appendChild(el("span", "pb-label", it.label));
      box.appendChild(el("span", "pb-value", it.value));
      box.appendChild(el("span", "pb-note", it.note));
      band.appendChild(box);
    });
    card.appendChild(band);

    var tiles = el("div", "home-tiles");
    var t1 = el("div", "tile");
    t1.appendChild(el("span", "tile-label", "당근 매물"));
    t1.appendChild(el("span", "tile-value", fmtWon(lis.price)));
    t1.appendChild(el("span", "tile-note", "articles/4758017 · 등록 " + (lis.perf.months || "") + " · 가격 협의"));
    if (lis.url) {
      var a = el("a", "tile-link", "매물 보기 ↗");
      a.href = lis.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      t1.appendChild(a);
    }
    tiles.appendChild(t1);

    var t2 = el("div", "tile");
    t2.appendChild(el("span", "tile-label", "노출 성과"));
    t2.appendChild(el("span", "tile-value", "조회 " + (lis.perf.views || "-")));
    t2.appendChild(el("span", "tile-note", "관심 " + (lis.perf.interests || "-") + " · 채팅 " + (lis.perf.chats || "-") + " · 관심 전환 1.1%"));
    tiles.appendChild(t2);

    var t3 = el("div", "tile");
    t3.appendChild(el("span", "tile-label", "사진"));
    t3.appendChild(el("span", "tile-value", (lis.photos || "-") + "장"));
    t3.appendChild(el("span", "tile-note", "전부 야간 촬영 + 동영상 " + (lis.videoSec || "-") + "초 · 오션뷰 증명 사진 없음"));
    tiles.appendChild(t3);

    var t4 = el("div", "tile");
    t4.appendChild(el("span", "tile-label", "가격 좌표"));
    t4.appendChild(el("span", "tile-value", "+10.6%"));
    t4.appendChild(el("span", "tile-note", "34평 12개월 중앙값 3억 5,250만 대비 · 시장 최상단 호가"));
    tiles.appendChild(t4);
    card.appendChild(tiles);

    return card;
  }

  function diagnosisBlock(re) {
    var lis = re.listing;
    var box = el("section", "diag-card");
    var head = el("div", "diag-head");
    head.appendChild(el("h3", "block-title", "왜 안 팔릴까 — 당근 매물 진단"));
    box.appendChild(head);
    var grid = el("div", "diag-grid");
    (lis.subs || []).forEach(function (sub, i) {
      if (i > 3) return; // 사진·설명·가격·노출만 카드로 (시장은 아래 뉴스에서)
      var item = el("div", "diag-item");
      var h = el("h4", "diag-title");
      inline(h, sub.title, []);
      item.appendChild(h);
      var ul = el("ul", "diag-list");
      sub.items.slice(0, 3).forEach(function (t) {
        var li = el("li");
        inline(li, t, []);
        ul.appendChild(li);
      });
      if (ul.childNodes.length) item.appendChild(ul);
      if (sub.table) {
        if (!ul.childNodes.length) {
          // 불릿 없이 표만 있는 절(③ 가격)은 표를 그대로 펼쳐 보여 준다
          item.appendChild(renderTable(sub.table, []));
        } else {
          var det = el("details", "diag-table");
          det.appendChild(el("summary", null, "가격 비교표 보기"));
          det.appendChild(renderTable(sub.table, []));
          item.appendChild(det);
        }
      }
      grid.appendChild(item);
    });
    box.appendChild(grid);
    if (lis.naverNote) {
      var note = el("p", "diag-note");
      inline(note, lis.naverNote, []);
      box.appendChild(note);
    }
    return box;
  }

  function strategyBlock(re) {
    var st = re.strategy;
    var box = el("section", "strategy-card");
    box.appendChild(el("h3", "block-title", "3단계 매도 전략 — 목표 3.9억 / 마지노선 3.7억"));

    var plans = el("div", "plan-grid");
    (st.plans || []).forEach(function (plan, i) {
      var p = el("div", "plan plan--" + (i + 1));
      p.appendChild(el("h4", "plan-title", plan.label));
      var dl = el("dl", "plan-rows");
      plan.rows.forEach(function (r) {
        var dt = el("dt", null, r.k);
        var dd = el("dd");
        inline(dd, r.v, []);
        dl.appendChild(dt);
        dl.appendChild(dd);
      });
      p.appendChild(dl);
      plans.appendChild(p);
    });
    box.appendChild(plans);

    if (st.breakEven && st.breakEven.length) {
      var be = el("div", "breakeven");
      be.appendChild(el("h4", "be-title", "손익분기 — 3.9억을 위해 쓸 수 있는 수리비 상한"));
      var ul = el("ul", "be-list");
      st.breakEven.forEach(function (item) {
        var li = el("li");
        inline(li, item.text || item, []);
        ul.appendChild(li);
      });
      be.appendChild(ul);
      box.appendChild(be);
    }

    if (st.recommend && st.recommend.length) {
      var rec = el("div", "reco");
      rec.appendChild(el("h4", "be-title", "권고 — “1안의 준비로 2안의 가격”"));
      var ol = el("ol", "reco-list");
      st.recommend.forEach(function (item) {
        var li = el("li");
        inline(li, item.text || item, []);
        ol.appendChild(li);
      });
      rec.appendChild(ol);
      box.appendChild(rec);
    }

    if (st.checklist && st.checklist.length) {
      var det = el("details", "checklist");
      det.appendChild(el("summary", null, "3.9억에 실제로 팔리려면 — 체크리스트 " + st.checklist.length + "개"));
      var body = el("div");
      renderBlocks(body, [{ t: "task", items: st.checklist }], []);
      det.appendChild(body);
      box.appendChild(det);
    }
    return box;
  }

  function compareBlock(re) {
    var cmp = re.compare;
    var box = el("section", "compare-card");
    var head = el("div", "section-head");
    head.appendChild(el("h2", "section-title", "명지 일대 30평대 경쟁 단지 비교"));
    head.appendChild(el("p", "section-sub", "같은 시기에 매수자가 함께 보는 단지 — 우리집 위치를 상대적으로 보기"));
    box.appendChild(head);

    if (cmp.notes && cmp.notes.length) {
      var intro = el("div", "section-intro");
      cmp.notes.forEach(function (n) {
        var p = el("p", "doc-p");
        inline(p, n, []);
        intro.appendChild(p);
      });
      box.appendChild(intro);
    }

    if (cmp.table) {
      var tw = renderTable(cmp.table, []);
      tw.classList.add("tbl-wrap--compare");
      box.appendChild(tw);
    }

    var cards = el("div", "complex-grid");
    (cmp.cards || []).forEach(function (c) {
      var card = el("article", "complex" + (c.base ? " complex--base" : "") + (c.reference ? " complex--ref" : ""));
      var top = el("div", "complex-top");
      top.appendChild(el("h3", "complex-name", c.name));
      var flag = c.base ? "우리집 단지 (기준)" : c.reference ? "참고" : "경쟁";
      top.appendChild(el("span", "complex-flag", flag));
      card.appendChild(top);
      var dl = el("dl", "complex-rows");
      c.pairs.forEach(function (pair) {
        var dt = el("dt", null, pair.k);
        var dd = el("dd");
        inline(dd, pair.v, []);
        dl.appendChild(dt);
        dl.appendChild(dd);
      });
      card.appendChild(dl);
      cards.appendChild(card);
    });
    box.appendChild(cards);

    if (cmp.conclusion && cmp.conclusion.length) {
      var conc = el("div", "conclusion");
      conc.appendChild(el("h3", "block-title", cmp.conclusionTitle || "비교 결론"));
      var ol = el("ol", "reco-list");
      cmp.conclusion.forEach(function (t) {
        var li = el("li");
        inline(li, t, []);
        ol.appendChild(li);
      });
      conc.appendChild(ol);
      box.appendChild(conc);
    }
    return box;
  }

  function newsBlock(re) {
    var box = el("section", "news-card");
    var head = el("div", "section-head");
    head.appendChild(el("h2", "section-title", "강서구 · 명지 시장 동향"));
    head.appendChild(el("p", "section-sub", (re.news || []).length + "건 — 매주 갱신되는 지역 뉴스"));
    box.appendChild(head);
    if (re.newsIntro) {
      var p = el("p", "doc-p");
      inline(p, re.newsIntro, []);
      box.appendChild(p);
    }
    var list = el("div", "news-list");
    (re.news || []).forEach(function (n, i) {
      var item = el("article", "news-item");
      var h = el("h3", "news-title");
      var num = el("span", "news-no", String(i + 1));
      h.appendChild(num);
      inline(h, n.title, []);
      item.appendChild(h);
      if (n.desc) {
        var d = el("div", "news-desc");
        inline(d, n.desc, []);
        item.appendChild(d);
      }
      if (n.urls && n.urls.length) {
        var src = el("div", "sources");
        n.urls.forEach(function (u) {
          var a = el("a", "chip", u.replace(/^https?:\/\//, "").split("/")[0] + " ↗");
          a.href = u;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          src.appendChild(a);
        });
        item.appendChild(src);
      }
      list.appendChild(item);
    });
    box.appendChild(list);
    return box;
  }

  function detailsBlock(re) {
    var box = el("section", "details-card");
    var head = el("div", "section-head");
    head.appendChild(el("h2", "section-title", "근거 자료 — 실거래 · 매물 · 시세 원문"));
    head.appendChild(el("p", "section-sub", "리포트 원문의 표와 수치를 그대로 옮겼습니다"));
    box.appendChild(head);
    (re.details || []).forEach(function (sec) {
      var det = el("details", "doc-fold");
      det.id = "sec-re-" + sec.num;
      var summary = el("summary", "doc-fold-head");
      summary.appendChild(el("span", "doc-fold-no", sec.num ? sec.num + "." : "·"));
      var t = el("span", "doc-fold-title");
      inline(t, sec.title, []);
      summary.appendChild(t);
      det.appendChild(summary);
      var body = el("div", "doc-fold-body");
      renderBlocks(body, sec.blocks, []);
      det.appendChild(body);
      box.appendChild(det);
    });
    return box;
  }

  function renderRealestate() {
    var re = currentRe();
    if (!re) return;
    var frag = document.createDocumentFragment();

    var hero = el("div", "re-hero-head");
    hero.appendChild(el("p", "doc-kicker", re.date.replace(/-/g, ".") + " (" + re.weekday + ") 조사 · 매주 갱신"));
    var h = el("h2", "doc-hero-title", re.title);
    hero.appendChild(h);
    if (re.stamp) hero.appendChild(el("p", "doc-stamp", re.stamp));
    frag.appendChild(hero);

    frag.appendChild(homeCard(re));
    frag.appendChild(strategyBlock(re));
    frag.appendChild(diagnosisBlock(re));
    frag.appendChild(compareBlock(re));
    frag.appendChild(newsBlock(re));
    frag.appendChild(detailsBlock(re));
    els.view.appendChild(frag);
  }

  /* ---------------- 검색 ---------------- */
  function collectEntries() {
    var out = [];
    var inv = currentInvest(), re = currentRe();
    if (inv) {
      inv.groups.forEach(function (g) {
        g.subs.forEach(function (s) {
          out.push({
            cat: g.key === "stock" ? "stock" : g.key === "coin" ? "coin" : "all",
            badge: g.emoji + " " + g.label,
            title: s.title,
            text: textOf(s.blocks),
            target: "sec-" + g.key + "-" + s.num,
            catKey: g.key === "stock" ? "stock" : "coin"
          });
        });
        if (g.key === "closing") {
          out.push({
            cat: "all", badge: "🧾 정리", title: g.title, text: textOf(g.blocks), catKey: "all"
          });
        }
      });
    }
    if (re) {
      (re.details || []).forEach(function (sec) {
        out.push({
          cat: "realestate", badge: "🏠 리포트 " + sec.num, title: sec.title,
          text: textOf(sec.blocks), target: "sec-re-" + sec.num, catKey: "realestate"
        });
      });
      (re.compare.cards || []).forEach(function (c) {
        out.push({
          cat: "realestate", badge: "🏠 경쟁 단지", title: c.name,
          text: textOf(c.pairs) + " " + c.name, catKey: "realestate"
        });
      });
      (re.news || []).forEach(function (n) {
        out.push({
          cat: "realestate", badge: "🏠 시장 뉴스", title: plain(n.title),
          text: (n.desc || "") + " " + (n.urls || []).join(" "), catKey: "realestate"
        });
      });
      (re.strategy.plans || []).forEach(function (p) {
        out.push({
          cat: "realestate", badge: "🏠 매도 전략", title: p.label,
          text: textOf(p.rows), catKey: "realestate"
        });
      });
      (re.summary || []).forEach(function (t, i) {
        out.push({
          cat: "realestate", badge: "🏠 요약", title: "3줄 요약 " + (i + 1),
          text: plain(t), catKey: "realestate"
        });
      });
    }
    return out;
  }

  function snippet(text, terms) {
    var lower = text.toLowerCase();
    var at = -1;
    terms.forEach(function (t) {
      var i = lower.indexOf(t);
      if (i >= 0 && (at < 0 || i < at)) at = i;
    });
    if (at < 0) at = 0;
    var start = Math.max(0, at - 60);
    var end = Math.min(text.length, at + 220);
    return (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
  }

  function renderSearch() {
    var terms = getTerms();
    var entries = collectEntries();
    var hits = [];
    entries.forEach(function (e) {
      // 검색은 탭과 무관하게 전체 브리핑을 훑는다(아버님이 어디 있는지 모르고 찾을 때가 많다)
      var hay = (e.title + " " + e.badge + " " + e.text).toLowerCase();
      if (terms.every(function (t) { return hay.indexOf(t) >= 0; })) hits.push(e);
    });

    els.status.textContent = "‘" + state.q.trim() + "’ 전체 검색 결과 " + hits.length + "건";

    if (!hits.length) {
      var empty = el("div", "empty");
      empty.appendChild(el("span", "empty-emoji", "🔍"));
      empty.appendChild(el("p", "empty-title", "검색 결과가 없습니다"));
      empty.appendChild(el("p", "empty-body", "다른 키워드로 찾아보세요 — 예: 비트코인, 코스피, 엘크루, 3억 7,000"));
      var reset = el("button", null, "검색 지우기");
      reset.type = "button";
      reset.addEventListener("click", function () {
        state.q = "";
        els.searchInput.value = "";
        els.searchClear.hidden = true;
        render();
      });
      empty.appendChild(reset);
      els.view.appendChild(empty);
      return;
    }

    var wrap = el("div", "search-results");
    hits.forEach(function (e) {
      var card = el("article", "hit");
      var top = el("div", "hit-top");
      top.appendChild(el("span", "hit-badge", e.badge));
      if (e.target) {
        var go = el("button", "hit-go", "열기 →");
        go.type = "button";
        go.addEventListener("click", function () {
          state.cat = e.catKey;
          state.q = "";
          els.searchInput.value = "";
          els.searchClear.hidden = true;
          render();
          var node = document.getElementById(e.target);
          if (node) {
            if (node.tagName === "DETAILS") node.open = true;
            node.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        });
        top.appendChild(go);
      }
      card.appendChild(top);
      var h = el("h3", "hit-title");
      inline(h, e.title, terms);
      card.appendChild(h);
      var body = el("p", "hit-snippet");
      inline(body, snippet(e.text, terms), terms);
      card.appendChild(body);
      wrap.appendChild(card);
    });
    els.view.appendChild(wrap);
  }

  /* ---------------- render ---------------- */
  function render() {
    var searching = getTerms().length > 0;
    renderTabs();
    renderDates();
    els.view.textContent = "";

    if (searching) {
      renderSearch();
    } else if (state.cat === "all") {
      var inv = currentInvest(), re = currentRe();
      var bits = [];
      if (inv) bits.push("투자 " + inv.date.replace(/-/g, "."));
      if (re) bits.push("부동산 " + re.date.replace(/-/g, "."));
      els.status.textContent = bits.join(" · ") + " · 탭을 눌러 코인·주식·부동산을 나눠 볼 수 있습니다";
      renderAll();
    } else if (state.cat === "realestate") {
      var re2 = currentRe();
      els.status.textContent = "부동산 리포트 " + (re2 ? re2.date.replace(/-/g, ".") : "") + " · 우리집 카드 → 경쟁 단지 비교 → 시장 동향";
      renderRealestate();
    } else {
      var inv2 = currentInvest();
      els.status.textContent = (state.cat === "coin" ? "코인" : "주식") + " · " + (inv2 ? inv2.date.replace(/-/g, ".") + " (" + inv2.weekday + ") 기준" : "");
      renderInvestDoc(state.cat);
    }

    if (data) {
      els.footerMeta.textContent =
        "투자 최신 " + (data.latestInvest || "-") + " · 부동산 최신 " + (data.latestRealestate || "-") +
        " · 데이터 생성 " + (data.updatedAt || "");
    }
    var main = document.getElementById("main");
    if (main && !searching) main.scrollTop = 0;
  }

  function init() {
    els.tabs = $("#tabs");
    els.dates = $("#dates");
    els.view = $("#view");
    els.status = $("#status");
    els.searchInput = $("#search-input");
    els.searchForm = $("#search-form");
    els.searchClear = $("#search-clear");
    els.themeToggle = $("#theme-toggle");
    els.footerMeta = $("#footer-meta");

    initTheme();

    window.addEventListener("hashchange", function () {
      var h = readHash();
      if (h && h !== state.cat) { state.cat = h; render(); }
    });

    var t = null;
    els.searchInput.addEventListener("input", function () {
      els.searchClear.hidden = !els.searchInput.value;
      clearTimeout(t);
      t = setTimeout(function () {
        state.q = els.searchInput.value;
        render();
      }, 160);
    });
    els.searchForm.addEventListener("submit", function (e) {
      e.preventDefault();
      state.q = els.searchInput.value;
      render();
    });
    els.searchClear.addEventListener("click", function () {
      els.searchInput.value = "";
      els.searchClear.hidden = true;
      state.q = "";
      render();
      els.searchInput.focus();
    });

    els.view.appendChild(el("div", "skeleton"));
    loadData().then(function (json) {
      data = json;
      state.invDate = data.invest && data.invest[0] ? data.invest[0].date : null;
      state.reDate = data.realestate && data.realestate[0] ? data.realestate[0].date : null;
      var fromHash = readHash();
      if (fromHash) state.cat = fromHash;
      els.view.textContent = "";
      render();
    }).catch(function (err) {
      els.view.textContent = "";
      var box = el("div", "error");
      box.appendChild(el("strong", null, "브리핑을 불러오지 못했습니다. "));
      box.appendChild(el("span", null, String(err && err.message ? err.message : err)));
      els.view.appendChild(box);
      els.status.textContent = "";
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
