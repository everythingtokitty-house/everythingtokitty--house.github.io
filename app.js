/* 모닝 트렌드 브리핑 — 렌더링/검색/필터
   순수 바닐라 JS, 빌드 없음. 데이터는 ./data/briefs.json 을 fetch하고,
   file:// 로 열어 fetch가 막히면 data/briefs.js 의 window.__BRIEFS__ 로 대체한다.
   모든 사용자 데이터는 textNode로만 그린다(innerHTML 미사용). */
(function () {
  "use strict";

  var CATS = [
    { key: "all", label: "전체", emoji: "" },
    { key: "trend", label: "국내 화제", emoji: "🔥" },
    { key: "marketing", label: "마케터 뉴스", emoji: "📊" },
    { key: "ai", label: "AI 정보", emoji: "🤖" },
    { key: "kitty", label: "키티·콜라보", emoji: "🎀" }
  ];
  var CAT_BY_KEY = { trend: CATS[1], marketing: CATS[2], ai: CATS[3], kitty: CATS[4] };
  var CHARACTERS_URL = "https://everythingtokitty-house.github.io/everythingtokitty--house.github.io/characters/";
  var WEEKDAYS = { 월: "월요일", 화: "화요일", 수: "수요일", 목: "목요일", 금: "금요일", 토: "토요일", 일: "일요일" };
  var THEME_KEY = "morning-brief-theme";
  var CLAMP_LENGTH = 480;

  var els = {};
  var data = null;
  var state = { date: "all", cat: "all", q: "" };
  var expandedIds = Object.create(null);

  /* ---------- helpers ---------- */
  function $(sel) { return document.querySelector(sel); }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  function formatDate(date) { return date.slice(5).replace("-", "."); }

  function getTerms() {
    return state.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  }

  /* ---------- text rendering (safe) ---------- */
  var URL_RE = /https?:\/\/[^\s<>"')\]]+/g;

  function appendMarked(parent, text, terms) {
    if (!terms || !terms.length) {
      parent.appendChild(document.createTextNode(text));
      return;
    }
    var sorted = terms.slice().sort(function (a, b) { return b.length - a.length; });
    var re = new RegExp("(" + sorted.map(escapeRe).join("|") + ")", "gi");
    var parts = text.split(re);
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
    var parts = String(text).split(/(\*\*[^*]+\*\*)/g);
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];
      if (!part) continue;
      if (part.length > 4 && part.slice(0, 2) === "**" && part.slice(-2) === "**") {
        var strong = document.createElement("strong");
        appendText(strong, part.slice(2, -2), terms);
        parent.appendChild(strong);
      } else {
        appendText(parent, part, terms);
      }
    }
  }

  function renderLines(parent, text, terms) {
    var lines = String(text || "").split("\n");
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (!line.trim()) continue;
      var bullet = /^\s*[-•]\s+(.*)$/.exec(line);
      var div = document.createElement("div");
      if (bullet) {
        div.className = "bullet";
        inline(div, bullet[1], terms);
      } else {
        div.className = "line";
        inline(div, line, terms);
      }
      parent.appendChild(div);
    }
  }

  /* ---------- matching ---------- */
  function plain(text) { return String(text || "").replace(/\*\*/g, ""); }

  function itemHay(item) {
    var parts = [
      item.title, item.summary, item.whyHot, item.insight, item.note,
      item.checked, item.sourceText, item.categoryLabel
    ];
    (item.sources || []).forEach(function (s) { parts.push(s.label, s.url); });
    return plain(parts.join(" ")).toLowerCase();
  }

  function kittyHay(item) {
    var visit = item.visit || {};
    var parts = [item.title, item.brand, item.status, item.priceLine, item.priceNote,
      item.headline, item.visit, visit.venue, visit.address, visit.period, visit.hours];
    (item.schedule || []).forEach(function (line) { parts.push(line); });
    (item.points || []).forEach(function (line) { parts.push(line); });
    (item.links || []).forEach(function (s) { parts.push(s.label, s.url); });
    return plain(parts.join(" ")).toLowerCase();
  }

  function matchKitty(item, terms) {
    if (!terms.length) return true;
    return hitText(kittyHay(item), terms);
  }

  function extraHay(extra) {
    var parts = [extra.title, extra.body, extra.group];
    (extra.sources || []).forEach(function (s) { parts.push(s.label, s.url); });
    return plain(parts.join(" ")).toLowerCase();
  }

  function hitText(hay, terms) {
    for (var i = 0; i < terms.length; i++) {
      if (hay.indexOf(terms[i]) < 0) return false;
    }
    return true;
  }

  function matchItem(item, terms) {
    if (state.cat !== "all" && item.category !== state.cat) return false;
    if (!terms.length) return true;
    return hitText(itemHay(item), terms);
  }

  function countIn(days, terms) {
    var n = 0;
    days.forEach(function (day) {
      day.items.forEach(function (item) { if (matchItem(item, terms)) n += 1; });
      if (state.cat === "all") {
        day.extras.forEach(function (e) { if (hitText(extraHay(e), terms)) n += 1; });
        day.ideas.forEach(function (t) { if (hitText(plain(t).toLowerCase(), terms)) n += 1; });
      }
    });
    return n;
  }

  /* ---------- theme ---------- */
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    var btn = els.themeToggle;
    if (btn) {
      btn.textContent = theme === "dark" ? "☀️" : "🌙";
      btn.setAttribute("aria-label", theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환");
      btn.setAttribute("title", theme === "dark" ? "라이트 모드" : "다크 모드");
    }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "dark" ? "#131216" : "#FFFBF9");
  }

  function initTheme() {
    var saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch (e) { saved = null; }
    var mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
    applyTheme(saved || (mq && mq.matches ? "dark" : "light"));
    if (mq) {
      var onChange = function (e) {
        var stored = null;
        try { stored = localStorage.getItem(THEME_KEY); } catch (err) { stored = null; }
        if (!stored) applyTheme(e.matches ? "dark" : "light");
      };
      if (mq.addEventListener) mq.addEventListener("change", onChange);
      else if (mq.addListener) mq.addListener(onChange);
    }
  }

  /* ---------- data ---------- */
  function loadData() {
    return fetch("./data/briefs.json", { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .catch(function (err) {
        if (window.__BRIEFS__) return window.__BRIEFS__;
        throw err;
      });
  }

  /* ---------- components ---------- */
  function sourceChips(sources) {
    var wrap = el("div", "sources");
    (sources || []).forEach(function (source) {
      var a = el("a", "chip");
      a.href = source.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.appendChild(el("span", "chip-dot"));
      a.appendChild(el("span", "chip-label", source.label));
      wrap.appendChild(a);
    });
    return wrap;
  }

  function card(item, terms) {
    var cat = CAT_BY_KEY[item.category] || CATS[1];
    var article = el("article", "card card--" + item.category);
    article.setAttribute("aria-labelledby", "t-" + item.id);

    var head = el("div", "card-head");
    head.appendChild(el("span", "badge badge--" + item.category,
      (cat.emoji ? cat.emoji + " " : "") + item.categoryLabel));
    head.appendChild(el("span", "card-no", String(item.no).padStart(2, "0")));
    article.appendChild(head);

    var title = el("h3", "card-title");
    title.id = "t-" + item.id;
    inline(title, item.title, terms);
    article.appendChild(title);

    if (item.checked) {
      var checked = el("p", "checked");
      checked.appendChild(el("span", "checked-label", "확인"));
      inline(checked, item.checked, terms);
      article.appendChild(checked);
    }

    var summary = el("div", "card-summary");
    renderLines(summary, item.summary, terms);
    article.appendChild(summary);

    var long = plain(item.summary).length > CLAMP_LENGTH;
    if (long && !expandedIds[item.id]) summary.className += " is-clamped";
    if (long) {
      var more = el("button", "more-btn", expandedIds[item.id] ? "접기 ▴" : "전체 내용 보기 ▾");
      more.type = "button";
      more.setAttribute("aria-expanded", String(!!expandedIds[item.id]));
      more.addEventListener("click", function () {
        if (expandedIds[item.id]) delete expandedIds[item.id];
        else expandedIds[item.id] = true;
        summary.classList.toggle("is-clamped", !expandedIds[item.id]);
        more.textContent = expandedIds[item.id] ? "접기 ▴" : "전체 내용 보기 ▾";
        more.setAttribute("aria-expanded", String(!!expandedIds[item.id]));
      });
      article.appendChild(more);
    }

    if (item.whyHot) {
      var why = el("div", "why");
      why.appendChild(el("span", "why-label", "왜 터졌나"));
      var whyBody = document.createElement("div");
      renderLines(whyBody, item.whyHot, terms);
      why.appendChild(whyBody);
      article.appendChild(why);
    }

    if (item.insight) {
      var insight = el("div", "insight");
      var label = el("span", "insight-label");
      label.appendChild(document.createTextNode("💡 "));
      var labelText = el("span", null, "마케터·숏폼 인사이트");
      label.appendChild(labelText);
      insight.appendChild(label);
      var body = document.createElement("div");
      renderLines(body, item.insight, terms);
      insight.appendChild(body);
      article.appendChild(insight);
    }

    if (item.note) {
      var note = el("p", "note");
      inline(note, item.note, terms);
      article.appendChild(note);
    }

    if (item.sources && item.sources.length) {
      article.appendChild(sourceChips(item.sources));
    }
    if (item.sourceText) {
      var srcText = el("p", "source-text");
      inline(srcText, "출처 " + item.sourceText, []);
      article.appendChild(srcText);
    }
    return article;
  }

  function extraBlock(list, terms) {
    if (!list.length) return null;
    var wrap = el("div", "extras");
    var title = el("h3", "block-title", "짧게 전하는 소식");
    wrap.appendChild(title);

    var groups = [], byGroup = {};
    list.forEach(function (extra) {
      var key = extra.group || "그 밖의 소식";
      if (!byGroup[key]) { byGroup[key] = []; groups.push(key); }
      byGroup[key].push(extra);
    });

    groups.forEach(function (key) {
      var group = el("div", "extra-group");
      if (groups.length > 1 || key !== "짧게 전하는 소식") {
        group.appendChild(el("p", "extra-group-label", key));
      }
      byGroup[key].forEach(function (extra) {
        var box = el("div", "extra");
        if (extra.title) {
          var t = el("p", "extra-title");
          inline(t, extra.title, terms);
          box.appendChild(t);
        }
        var body = el("div", "extra-body");
        renderLines(body, extra.body, terms);
        box.appendChild(body);
        if (extra.sources && extra.sources.length) box.appendChild(sourceChips(extra.sources));
        group.appendChild(box);
      });
      wrap.appendChild(group);
    });
    return wrap;
  }

  function ideasBlock(ideas, terms) {
    if (!ideas.length) return null;
    var sec = el("section", "ideas");
    sec.appendChild(el("h3", "block-title", "오늘 바로 쓸 수 있는 기획 아이디어"));
    var ol = el("ol", "ideas-list");
    ideas.forEach(function (text) {
      var li = document.createElement("li");
      inline(li, text, terms);
      ol.appendChild(li);
    });
    sec.appendChild(ol);
    return sec;
  }

  function caveatsBlock(caveats, terms, open) {
    if (!caveats.length) return null;
    var details = el("details", "caveats");
    if (open) details.open = true;
    var summary = document.createElement("summary");
    summary.textContent = "확인하지 못한 것 · 주의 " + caveats.length;
    details.appendChild(summary);
    var ul = el("ul", "caveats-list");
    caveats.forEach(function (text) {
      var li = document.createElement("li");
      inline(li, text, terms);
      ul.appendChild(li);
    });
    details.appendChild(ul);
    return details;
  }

  /* ---------- 🎀 키티·콜라보 ---------- */
  function kittyStatusClass(status) {
    var s = String(status || "");
    if (s.indexOf("종료") === 0) return "is-ended";
    if (s.indexOf("예정") >= 0) return "is-soon";
    return "is-live";
  }

  function kittyRow(label, lines, dim) {
    var row = el("div", "kitty-row" + (dim ? " kitty-row--dim" : ""));
    row.appendChild(el("span", "kitty-label", label));
    var body = el("div", "kitty-value");
    lines.forEach(function (line) {
      body.appendChild(el("div", null, line));
    });
    row.appendChild(body);
    return row;
  }

  function kittyCta(site) {
    var a = el("a", "kitty-cta");
    a.href = (site && site.siteUrl) || CHARACTERS_URL;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.appendChild(el("span", "kitty-cta-text", (site && site.siteTitle) || "🎀 8대 캐릭터 콜라보 전체 사이트 보기 →"));
    return a;
  }

  function kittyCard(item, terms) {
    var article = el("article", "card card--kitty");
    var head = el("div", "card-head");
    head.appendChild(el("span", "badge badge--kitty", "🎀 " + (item.brand || "산리오")));
    head.appendChild(el("span", "kitty-status " + kittyStatusClass(item.status), item.status));
    article.appendChild(head);

    var title = el("h3", "card-title");
    inline(title, item.title, terms);
    article.appendChild(title);

    var meta = el("div", "kitty-meta");
    if (item.schedule && item.schedule.length) {
      meta.appendChild(kittyRow("일정", item.schedule));
    }
    if (item.priceLine) {
      var priceLines = [item.priceLine];
      if (item.priceNote) priceLines.push(item.priceNote);
      meta.appendChild(kittyRow("가격", priceLines, Boolean(item.priceNote)));
    }
    if (item.visit) {
      var visitLines = [item.visit.venue, item.visit.address, item.visit.hours].filter(Boolean);
      if (visitLines.length) meta.appendChild(kittyRow("방문", visitLines));
    }
    if (meta.childNodes.length) article.appendChild(meta);

    if (item.headline) {
      var summary = el("div", "kitty-summary");
      summary.appendChild(el("span", "kitty-summary-label", "한 줄 요약"));
      var text = el("p", "kitty-summary-text");
      inline(text, item.headline, terms);
      summary.appendChild(text);
      article.appendChild(summary);
    }

    if (item.points && item.points.length) {
      var list = el("ul", "kitty-points");
      item.points.forEach(function (point) {
        var li = document.createElement("li");
        inline(li, point, terms);
        list.appendChild(li);
      });
      article.appendChild(list);
    }

    if (item.links && item.links.length) {
      article.appendChild(el("span", "kitty-links-label", "공식 링크"));
      article.appendChild(sourceChips(item.links));
    }
    return article;
  }

  function kittySection(terms, shown) {
    var site = data.kittyCollabs || {};
    var all = site.items || [];
    var items = all.filter(function (item) { return matchKitty(item, terms); });

    var view = el("div", "kitty-view");

    var hero = el("section", "kitty-hero");
    hero.appendChild(el("p", "kitty-kicker", "🩷 산리오 · 헬로키티 콜라보"));
    hero.appendChild(el("h2", "kitty-hero-title", site.title || "산리오(헬로키티) 콜라보 최신 소식"));
    var brands = [];
    all.forEach(function (item) {
      if (item.brand && brands.indexOf(item.brand) < 0) brands.push(item.brand);
    });
    var desc = (site.asOf ? site.asOf + " 기준 · " : "") + all.length + "건";
    if (brands.length) desc += " · " + brands.join(" · ");
    hero.appendChild(el("p", "kitty-hero-desc", desc));
    hero.appendChild(kittyCta(site));
    hero.appendChild(el("p", "kitty-hero-note",
      "스타벅스·소니처럼 매장에서 만나는 굿즈부터 부산 팝업까지, 최근 진행·출시된 헬로키티 콜라보를 모았습니다."));
    view.appendChild(hero);

    if (items.length) {
      var cards = el("div", "cards kitty-cards");
      items.forEach(function (item) { cards.appendChild(kittyCard(item, terms)); });
      view.appendChild(cards);
    } else {
      view.appendChild(emptyState(terms));
    }

    var foot = el("section", "kitty-foot");
    foot.appendChild(el("p", "kitty-foot-title", "다른 캐릭터 콜라보도 보고 싶다면"));
    foot.appendChild(el("p", "kitty-foot-desc",
      "디즈니 · 포켓몬 · 미피 · 짱구 · 몬치치 · 리락쿠마 · 스누피까지 한 화면에서 봐요."));
    if (shown !== all.length) {
      foot.appendChild(el("p", "kitty-foot-desc",
        "지금은 검색어에 맞는 " + shown + "건만 보이고 있어요. 전체 " + all.length + "건은 사이트에서 볼 수 있습니다."));
    }
    foot.appendChild(kittyCta(site));
    view.appendChild(foot);
    return view;
  }

  function metaBlock(day) {
    if (!day.meta || !day.meta.length) return null;
    var details = el("details", "day-meta");
    var summary = document.createElement("summary");
    summary.textContent = "조사 범위·검증 원칙";
    details.appendChild(summary);
    var body = el("div", "day-meta-body");
    day.meta.forEach(function (m) {
      var row = el("div", "meta-row");
      row.appendChild(el("span", "meta-label", m.label));
      var value = el("div", "meta-value");
      if (m.extra) {
        var ex = el("div", "meta-extra");
        ex.textContent = m.extra;
        value.appendChild(ex);
      }
      var v = document.createElement("div");
      inline(v, m.value, []);
      value.appendChild(v);
      row.appendChild(value);
      body.appendChild(row);
    });
    details.appendChild(body);
    return details;
  }

  function daySection(day, terms) {
    var items = day.items.filter(function (item) { return matchItem(item, terms); });
    var showSupp = state.cat === "all";
    var extras = showSupp ? day.extras.filter(function (e) { return hitText(extraHay(e), terms); }) : [];
    var ideas = showSupp ? day.ideas.filter(function (t) { return hitText(plain(t).toLowerCase(), terms); }) : [];
    var caveats = showSupp ? day.caveats.filter(function (t) { return hitText(plain(t).toLowerCase(), terms); }) : [];
    if (!items.length && !extras.length && !ideas.length && !caveats.length) return null;

    var sec = el("section", "day");
    sec.id = "day-" + day.date;

    var head = el("header", "day-head");
    var date = el("h2", "day-date", formatDate(day.date));
    head.appendChild(date);
    head.appendChild(el("span", "day-week", WEEKDAYS[day.weekday] || day.weekday + "요일"));
    head.appendChild(el("span", "day-count",
      (items.length ? "이슈 " + items.length : "") +
      (items.length && extras.length ? " · " : "") +
      (extras.length ? "단신 " + extras.length : "")));
    sec.appendChild(head);

    if (!terms.length && day.headline) {
      var headline = el("div", "headline");
      headline.appendChild(el("span", "headline-label", "오늘의 한 줄"));
      var text = el("p", "headline-text");
      inline(text, day.headline, terms);
      headline.appendChild(text);
      sec.appendChild(headline);
    }

    if (!terms.length && state.cat === "all") {
      var meta = metaBlock(day);
      if (meta) sec.appendChild(meta);
    }

    if (items.length) {
      var cards = el("div", "cards");
      items.forEach(function (item) { cards.appendChild(card(item, terms)); });
      sec.appendChild(cards);
    }

    var extrasEl = extraBlock(extras, terms);
    if (extrasEl) sec.appendChild(extrasEl);

    var ideasEl = ideasBlock(ideas, terms);
    if (ideasEl) sec.appendChild(ideasEl);

    var caveatsEl = caveatsBlock(caveats, terms, Boolean(terms.length));
    if (caveatsEl) sec.appendChild(caveatsEl);

    return sec;
  }

  /* ---------- chrome (tabs / dates / status) ---------- */
  function renderTabs(counts) {
    els.tabs.textContent = "";
    var hasKitty = Boolean(data && data.kittyCollabs && (data.kittyCollabs.items || []).length);
    CATS.forEach(function (cat) {
      if (cat.key === "kitty" && !hasKitty) return;
      var btn = el("button", "tab");
      btn.type = "button";
      btn.setAttribute("aria-pressed", String(state.cat === cat.key));
      btn.appendChild(el("span", null, (cat.emoji ? cat.emoji + " " : "") + cat.label));
      btn.appendChild(el("span", "count", String(counts[cat.key] || 0)));
      btn.addEventListener("click", function () {
        if (state.cat === cat.key) return;
        state.cat = cat.key;
        render();
        scrollToResults();
      });
      els.tabs.appendChild(btn);
    });
  }

  function renderDates(terms) {
    els.dates.textContent = "";
    var counts = {};
    (data ? data.briefs : []).forEach(function (day) {
      counts[day.date] = day.items.filter(function (item) { return matchItem(item, terms); }).length;
    });
    var total = 0;
    (data ? data.briefs : []).forEach(function (day) { total += counts[day.date] || 0; });

    var all = el("button", "date-chip");
    all.type = "button";
    all.setAttribute("aria-pressed", String(state.date === "all"));
    all.appendChild(el("span", null, "전체 날짜"));
    all.appendChild(el("span", "count", String(total)));
    all.addEventListener("click", function () {
      if (state.date === "all") return;
      state.date = "all";
      render();
      scrollToResults();
    });
    els.dates.appendChild(all);

    (data ? data.briefs : []).forEach(function (day) {
      var btn = el("button", "date-chip");
      btn.type = "button";
      btn.setAttribute("aria-pressed", String(state.date === day.date));
      btn.appendChild(el("span", null, formatDate(day.date) + " " + day.weekday));
      btn.appendChild(el("span", "count", String(counts[day.date] || 0)));
      btn.addEventListener("click", function () {
        if (state.date === day.date) return;
        state.date = day.date;
        render();
        scrollToResults();
      });
      els.dates.appendChild(btn);
    });
    // 선택된 날짜 칩이 가로 스크롤 밖에 있으면 가운데로 옮긴다(페이지 스크롤은 건드리지 않음)
    var active = els.dates.querySelector('[aria-pressed="true"]');
    if (active && typeof active.offsetLeft === "number" && els.dates.clientWidth) {
      var centered = active.offsetLeft - (els.dates.clientWidth - active.offsetWidth) / 2;
      els.dates.scrollLeft = Math.max(0, centered);
    }
  }

  function setKittyStatus(terms, shown) {
    var site = data.kittyCollabs || {};
    var scope = site.asOf ? site.asOf + " 기준" : "산리오 콜라보";
    var label = terms.length ? "검색 결과 " : "콜라보 ";
    els.status.textContent = scope + " · 🎀 산리오(헬로키티) · " + label + shown + "건";
  }

  function setStatus(days, terms, expanded) {
    var items = 0;
    days.forEach(function (day) {
      day.items.forEach(function (item) { if (matchItem(item, terms)) items += 1; });
    });
    var cat = state.cat === "all" ? "전체 카테고리" : CAT_BY_KEY[state.cat].emoji + " " + CAT_BY_KEY[state.cat].label;
    var scope;
    if (state.date === "all" || expanded) scope = data.counts.days + "일 전체";
    else scope = formatDate(state.date) + " " + (days[0] ? days[0].weekday : "");
    var label = terms.length ? "검색 결과 " : "이슈 ";
    els.status.textContent = scope + " · " + cat + " · " + label + items + "건";
  }

  function scrollToResults() {
    var bar = els.bar || els.header;
    var offset = bar ? bar.getBoundingClientRect().bottom + window.scrollY : 0;
    if (window.scrollY > offset - 20) {
      window.scrollTo({ top: Math.max(0, offset - 8), behavior: "smooth" });
    }
  }

  function emptyState(terms) {
    var box = el("div", "empty");
    box.appendChild(el("span", "empty-emoji", "🔍"));
    if (terms.length) {
      box.appendChild(el("p", "empty-title", "‘" + state.q.trim() + "’ 검색 결과가 없습니다"));
      box.appendChild(el("p", "empty-body", "다른 키워드로 찾아보거나 날짜·카테고리를 바꿔 보세요."));
      var reset = el("button", null, "검색어 지우기");
      reset.type = "button";
      reset.addEventListener("click", function () {
        state.q = "";
        els.input.value = "";
        els.clear.hidden = true;
        render();
        els.input.focus();
      });
      box.appendChild(reset);
    } else {
      box.appendChild(el("p", "empty-title", "표시할 브리핑이 없습니다"));
      box.appendChild(el("p", "empty-body", "이 날짜·카테고리에 해당하는 내용이 없습니다."));
    }
    return box;
  }

  function errorState(err) {
    var box = el("div", "error");
    var p = el("p");
    var strong = el("strong", null, "브리핑 데이터를 불러오지 못했습니다.");
    p.appendChild(strong);
    p.appendChild(document.createTextNode(" data/briefs.json 경로와 네트워크를 확인해 주세요. (" +
      (err && err.message ? err.message : "알 수 없는 오류") + ")"));
    box.appendChild(p);
    var tip = el("p");
    tip.appendChild(document.createTextNode("로컬에서 파일을 더블클릭해 열었다면 브라우저가 fetch를 막습니다. "));
    tip.appendChild(document.createTextNode("폴더에서 "));
    var code = el("code", null, "python3 -m http.server 8000");
    tip.appendChild(code);
    tip.appendChild(document.createTextNode(" 를 실행한 뒤 http://localhost:8000/ 로 열어보세요."));
    box.appendChild(tip);
    return box;
  }

  function skeleton() {
    var box = el("div", "skeleton");
    for (var i = 0; i < 3; i++) box.appendChild(el("div", "skeleton-card"));
    return box;
  }

  /* ---------- render ---------- */
  function render() {
    if (!data) return;
    var terms = getTerms();
    var expandedNote = false;
    var days = data.briefs;

    if (state.date !== "all") {
      var selected = data.briefs.filter(function (d) { return d.date === state.date; });
      if (terms.length && countIn(selected, terms) === 0 && countIn(data.briefs, terms) > 0) {
        days = data.briefs;
        expandedNote = true;
      } else {
        days = selected;
      }
    }

    var counts = { all: 0, trend: 0, marketing: 0, ai: 0, kitty: 0 };
    days.forEach(function (day) {
      day.items.forEach(function (item) {
        if (terms.length && !hitText(itemHay(item), terms)) return;
        counts.all += 1;
        counts[item.category] += 1;
      });
    });
    var kittyItems = (data.kittyCollabs && data.kittyCollabs.items) || [];
    kittyItems.forEach(function (item) {
      if (matchKitty(item, terms)) counts.kitty += 1;
    });

    renderTabs(counts);
    if (state.cat === "kitty" && kittyItems.length) {
      els.dates.hidden = true;
      els.results.textContent = "";
      setKittyStatus(terms, counts.kitty);
      els.results.appendChild(kittySection(terms, counts.kitty));
      return;
    }
    if (state.cat === "kitty") state.cat = "all";
    els.dates.hidden = false;
    els.results.textContent = "";

    renderDates(terms);
    setStatus(days, terms, expandedNote);

    if (expandedNote) {
      var banner = el("div", "banner");
      var btext = el("span", "banner-text",
        formatDate(state.date) + "에는 ‘" + state.q.trim() + "’ 결과가 없어 전체 날짜에서 찾았습니다.");
      banner.appendChild(btext);
      var btn = el("button", null, "전체 날짜로 보기");
      btn.type = "button";
      btn.addEventListener("click", function () {
        state.date = "all";
        render();
      });
      banner.appendChild(btn);
      els.results.appendChild(banner);
    }

    var shown = 0;
    days.forEach(function (day) {
      var sec = daySection(day, terms);
      if (sec) {
        els.results.appendChild(sec);
        shown += 1;
      }
    });

    if (!shown) els.results.appendChild(emptyState(terms));
  }

  /* ---------- init ---------- */
  function init() {
    els.tabs = $("#tabs");
    els.dates = $("#dates");
    els.results = $("#results");
    els.status = $("#status");
    els.input = $("#search-input");
    els.clear = $("#search-clear");
    els.themeToggle = $("#theme-toggle");
    els.header = $("#app-header");
    els.bar = $("#filter-bar");
    els.footerMeta = $("#footer-meta");
    els.form = $("#search-form");
    if (!els.tabs || !els.results) return;

    initTheme();

    els.results.appendChild(skeleton());
    els.status.textContent = "브리핑을 불러오는 중…";

    loadData().then(function (json) {
      data = json;
      data.briefs.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
      state.date = data.latestDate || (data.briefs[0] && data.briefs[0].date) || "all";
      els.results.textContent = "";
      els.footerMeta.textContent = data.counts.days + "일치 · 이슈 " + data.counts.items +
        "건 · 짧은 소식 " + data.counts.extras + "건 · 기획 아이디어 " + data.counts.ideas +
        "개" + (data.counts.kitty ? " · 🎀 콜라보 " + data.counts.kitty + "건" : "") +
        " — " + data.updatedAt;
      render();
    }).catch(function (err) {
      els.results.textContent = "";
      els.results.appendChild(errorState(err));
      els.status.textContent = "데이터 없음";
    });

    els.form.addEventListener("submit", function (e) { e.preventDefault(); });

    var timer = null;
    els.input.addEventListener("input", function () {
      var value = els.input.value;
      els.clear.hidden = !value;
      window.clearTimeout(timer);
      timer = window.setTimeout(function () {
        state.q = value;
        render();
      }, 130);
    });

    els.clear.addEventListener("click", function () {
      els.input.value = "";
      els.clear.hidden = true;
      state.q = "";
      render();
      els.input.focus();
    });

    els.themeToggle.addEventListener("click", function () {
      var next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      applyTheme(next);
      try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* noop */ }
    });

    document.addEventListener("keydown", function (e) {
      var tag = (e.target && e.target.tagName || "").toLowerCase();
      var typing = tag === "input" || tag === "textarea" || (e.target && e.target.isContentEditable);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        els.input.focus();
        els.input.select();
      } else if (e.key === "Escape" && typing) {
        if (els.input.value) {
          els.input.value = "";
          els.clear.hidden = true;
          state.q = "";
          render();
        } else {
          els.input.blur();
        }
      }
    });

    window.addEventListener("scroll", function () {
      if (!els.bar) return;
      els.bar.classList.toggle("is-stuck", window.scrollY > 6);
    }, { passive: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
