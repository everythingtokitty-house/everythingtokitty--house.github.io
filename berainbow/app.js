/* 비더레인보우 사업 대시보드 — app.js (빌드 도구 없음, 데이터는 data/dashboard.json) */
(function () {
  "use strict";

  var KEY_TASK = "berainbow.tasks.v1";
  var KEY_RISK = "berainbow.risk.v1";
  var KEY_COST = "berainbow.cost.v1";
  var KEY_LINK = "berainbow.sellerlink.v1";

  var state = {
    tab: "today",
    done: {},
    riskDone: {},
    cost: 0,
    sellerLink: false
  };
  var DATA = null;

  /* ---------- 유틸 ---------- */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }
  function $(id) { return document.getElementById(id); }
  function clear(node) {
    if (!node) return;
    if (node.replaceChildren) node.replaceChildren();
    else while (node.firstChild) node.removeChild(node.firstChild);
  }
  function num(n) {
    var s = String(Math.round(n));
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }
  function won(n) { return num(n) + "원"; }
  function pct(v) { return (Math.round(v * 1000) / 10).toFixed(1) + "%"; }

  function load(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function save(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 사생활 보호 모드 */ }
  }

  var toastTimer = null;
  function toast(message) {
    var t = $("toast");
    if (!t) return;
    t.textContent = message;
    t.hidden = false;
    if (toastTimer) { try { clearTimeout(toastTimer); } catch (e) {} }
    try { toastTimer = setTimeout(function () { t.hidden = true; }, 2600); } catch (e) {}
  }

  function legacyCopy(text) {
    try {
      var area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      var ok = document.execCommand && document.execCommand("copy");
      document.body.removeChild(area);
      return !!ok;
    } catch (e) { return false; }
  }
  function copyText(text, message) {
    var msg = message || "복사했어요 — 그대로 붙여넣으면 됩니다.";
    var clip = (typeof navigator !== "undefined" && navigator.clipboard) ? navigator.clipboard : null;
    if (clip && clip.writeText) {
      try {
        clip.writeText(text).then(function () { toast(msg); }, function () {
          if (legacyCopy(text)) toast(msg); else toast("복사가 막혔어요 — 길게 눌러 직접 복사해 주세요.");
        });
        return true;
      } catch (e) { /* 아래 폴백 */ }
    }
    if (legacyCopy(text)) { toast(msg); return true; }
    toast("복사가 막혔어요 — 길게 눌러 직접 복사해 주세요.");
    return false;
  }
  function copyButton(label, getText, message) {
    var b = el("button", "copy-btn");
    b.type = "button";
    b.textContent = label || "복사";
    b.setAttribute("data-label", b.textContent);
    b.addEventListener("click", function () {
      copyText(getText(), message);
      b.textContent = "복사됨 ✓";
      b.className = "copy-btn is-copied";
    });
    return b;
  }

  /* ---------- 마진 계산 ---------- */
  function marginRows(cost, sellerLink) {
    if (!DATA) return [];
    var a = DATA.margin.assumptions;
    var c = Number(cost) || 0;
    return DATA.margin.rows.map(function (r) {
      var price = r.price;
      var fee = 0;
      var logistics = 0;
      if (r.channel === "coupang") {
        fee = price * a.coupang_fee;
        logistics = a.coupang_logistics;
      } else {
        var rate = sellerLink ? a.naver_link_fee : a.naver_fee;
        fee = price * rate * (1 + a.vat) + price * a.npay;
      }
      var net = price - fee - logistics - c;
      return {
        id: r.id, channel: r.channel, label: r.label, stage: r.stage, price: price,
        fee: Math.round(fee), logistics: logistics, net: Math.round(net),
        rate: price ? net / price : 0
      };
    });
  }

  /* ---------- 복사문 생성 ---------- */
  function buildReelCopy(reel) {
    var lines = [];
    lines.push("[릴스 콘티] " + reel.title + " (" + reel.length + " · " + reel.when + ")");
    lines.push("[첫 3초 훅] " + reel.hook);
    lines.push("");
    lines.push("[콘티]");
    reel.scenes.forEach(function (s) {
      lines.push(s.t + " | " + s.shot + " | 자막: \"" + s.caption + "\"");
    });
    lines.push("");
    lines.push("[CTA] " + reel.cta);
    lines.push("[규칙] 자막 12자 이내 · 이모지 금지 · 단정 표현(최고/완벽) 금지");
    return lines.join("\n");
  }
  function bannerText(b) {
    return "헤드: " + b.head + "\n서브: " + b.sub + "\nCTA: " + b.cta;
  }

  /* ---------- 렌더 ---------- */
  function renderMeta() {
    var m = DATA.meta;
    if ($("asof")) $("asof").textContent = "기준일 " + m.asof_label;
    var badge = $("update-badge");
    if (badge) {
      badge.textContent = "";
      badge.appendChild(el("span", "badge-ico", "🗓"));
      badge.appendChild(document.createTextNode(" " + m.update_badge));
    }
    var dday = "";
    try {
      var a = new Date(m.asof + "T00:00:00");
      var b = new Date(m.next_update + "T00:00:00");
      var diff = Math.round((b - a) / 86400000);
      dday = diff > 0 ? " (D-" + diff + ")" : diff === 0 ? " (오늘)" : "";
    } catch (e) { dday = ""; }
    if ($("next-update")) $("next-update").textContent = "다음 업데이트 " + m.next_update_label + dday;
    if ($("json-link")) $("json-link").setAttribute("href", m.json_path);
    if ($("footer-meta")) {
      $("footer-meta").textContent = m.brand + " " + m.handle + " · " + m.update_badge +
        " · 다음 " + m.next_update_label + " · " + m.owner_note;
    }
    if ($("status")) $("status").textContent = "비더레인보우 대시보드를 불러왔습니다.";
  }

  function renderKpis() {
    var root = $("kpi-grid");
    if (!root) return;
    clear(root);
    DATA.kpis.forEach(function (k) {
      var card = el("div", "kpi kpi--" + k.tone);
      card.setAttribute("data-kpi", k.id);
      var label = el("p", "kpi-label", k.label);
      var val = el("p", "kpi-value");
      val.appendChild(el("span", "kpi-num", k.value));
      val.appendChild(el("span", "kpi-unit", " " + k.unit));
      card.appendChild(label);
      card.appendChild(val);
      card.appendChild(el("p", "kpi-sub", k.sub));
      root.appendChild(card);
    });
  }

  function renderStrategy() {
    var root = $("strategy-grid");
    if (!root) return;
    clear(root);
    DATA.strategy.forEach(function (s) {
      var card = el("article", "strategy");
      card.setAttribute("data-strategy", s.id);
      card.appendChild(el("p", "strategy-kicker", s.kicker));
      card.appendChild(el("h4", "strategy-title", s.title));
      var ul = el("ul", "strategy-list");
      s.points.forEach(function (p) { ul.appendChild(el("li", null, p)); });
      card.appendChild(ul);
      root.appendChild(card);
    });
  }

  function renderDiag() {
    var root = $("diag-list");
    if (!root) return;
    clear(root);
    DATA.diagnosis.forEach(function (d) {
      var row = el("article", "diag diag--" + d.level);
      var head = el("div", "diag-head");
      head.appendChild(el("span", "diag-area", d.area));
      head.appendChild(el("span", "diag-level", d.level === "high" ? "즉시" : d.level === "mid" ? "이번 달" : "확인"));
      row.appendChild(head);
      row.appendChild(el("p", "diag-fact", d.fact));
      row.appendChild(el("p", "diag-verdict", "→ " + d.verdict));
      row.appendChild(el("p", "diag-action", "조치: " + d.action));
      root.appendChild(row);
    });
  }

  function taskDoneCount() {
    var n = 0;
    DATA.tasks.forEach(function (t) { if (state.done[t.id]) n++; });
    return n;
  }
  function renderTasks() {
    var root = $("task-list");
    if (!root) return;
    clear(root);
    DATA.tasks.forEach(function (t) {
      var li = el("li", "task");
      li.setAttribute("data-id", t.id);
      if (state.done[t.id]) li.className = "task is-done";

      var label = el("label", "task-check");
      var input = document.createElement("input");
      input.type = "checkbox";
      input.setAttribute("data-task", t.id);
      input.id = "chk-" + t.id;
      input.checked = !!state.done[t.id];
      var mark = el("span", "task-box");
      mark.setAttribute("aria-hidden", "true");
      label.appendChild(input);
      label.appendChild(mark);
      label.appendChild(el("span", "visually-hidden", t.title + " 완료 표시"));
      li.appendChild(label);

      var body = el("div", "task-body");
      var head = el("div", "task-head");
      head.appendChild(el("span", "task-num", (t.n < 10 ? "0" : "") + t.n));
      head.appendChild(el("h4", "task-title", t.title));
      head.appendChild(el("span", "pill", t.due));
      body.appendChild(head);
      body.appendChild(el("p", "task-why", t.why));
      var how = el("p", "task-how");
      how.appendChild(el("strong", null, "방법 "));
      how.appendChild(document.createTextNode(t.how));
      body.appendChild(how);
      body.appendChild(el("p", "task-impact", "기대: " + t.impact));
      li.appendChild(body);
      root.appendChild(li);

      input.addEventListener("change", function (ev) {
        var checked = !!(ev.target && ev.target.checked);
        state.done[t.id] = checked;
        save(KEY_TASK, state.done);
        li.className = checked ? "task is-done" : "task";
        updateTaskProgress();
      });

      if (t.id === "t6") {
        var jump = el("button", "linkish", "리스크 카드 보기 →");
        jump.type = "button";
        jump.setAttribute("data-goto-anchor", "risk-card");
        jump.addEventListener("click", function () {
          var target = $("risk-card");
          if (target && target.scrollIntoView) target.scrollIntoView({ behavior: "smooth", block: "center" });
        });
        body.appendChild(jump);
      }
    });
    updateTaskProgress();
  }
  function updateTaskProgress() {
    var total = DATA.tasks.length;
    var done = taskDoneCount();
    if ($("task-progress")) $("task-progress").textContent = done + " / " + total;
    var bar = $("task-progress-bar");
    if (bar) {
      bar.style.width = (total ? (done / total) * 100 : 0) + "%";
      if (bar.parentNode && bar.parentNode.setAttribute) {
        bar.parentNode.setAttribute("data-done", done + "/" + total);
      }
    }
  }

  function riskDoneCount() {
    var n = 0;
    DATA.risk.checks.forEach(function (c) { if (state.riskDone[c.id]) n++; });
    return n;
  }
  function renderRisk() {
    var root = $("risk-card");
    if (!root) return;
    clear(root);

    var head = el("div", "risk-head");
    head.appendChild(el("span", "risk-flag", "⚠️"));
    head.appendChild(el("h3", "risk-title", DATA.risk.title.replace("⚠️ ", "")));
    root.appendChild(head);
    root.appendChild(el("p", "risk-lead", DATA.risk.lead));

    var cols = el("div", "risk-cols");

    var cons = el("div", "risk-col");
    cons.appendChild(el("h4", "risk-sub", "서류가 없을 때 생기는 일"));
    var cul = el("ul", "risk-cons");
    DATA.risk.consequences.forEach(function (c) { cul.appendChild(el("li", null, c)); });
    cons.appendChild(cul);
    cols.appendChild(cons);

    var chk = el("div", "risk-col");
    var chkHead = el("div", "risk-subline");
    chkHead.appendChild(el("h4", "risk-sub", "사입 전 확인 6항목"));
    var counter = el("span", "risk-counter", riskDoneCount() + " / " + DATA.risk.checks.length);
    chkHead.appendChild(counter);
    chk.appendChild(chkHead);

    var list = el("ol", "risk-checks");
    DATA.risk.checks.forEach(function (c) {
      var li = el("li", "risk-check");
      li.setAttribute("data-id", c.id);
      if (state.riskDone[c.id]) li.className = "risk-check is-done";
      var label = el("label", "task-check");
      var input = document.createElement("input");
      input.type = "checkbox";
      input.setAttribute("data-risk", c.id);
      input.id = "chk-" + c.id;
      input.checked = !!state.riskDone[c.id];
      var mark = el("span", "task-box");
      mark.setAttribute("aria-hidden", "true");
      label.appendChild(input);
      label.appendChild(mark);
      label.appendChild(el("span", "visually-hidden", c.title + " 확인"));
      var body = el("div", "risk-check-body");
      body.appendChild(el("p", "risk-check-title", c.title));
      body.appendChild(el("p", "risk-check-detail", c.detail));
      li.appendChild(label);
      li.appendChild(body);
      list.appendChild(li);
      input.addEventListener("change", function (ev) {
        var checked = !!(ev.target && ev.target.checked);
        state.riskDone[c.id] = checked;
        save(KEY_RISK, state.riskDone);
        li.className = checked ? "risk-check is-done" : "risk-check";
        counter.textContent = riskDoneCount() + " / " + DATA.risk.checks.length;
      });
    });
    chk.appendChild(list);
    cols.appendChild(chk);
    root.appendChild(cols);
    root.appendChild(el("p", "risk-verdict", DATA.risk.verdict));
  }

  function renderPricing() {
    var root = $("price-steps");
    if (root) {
      clear(root);
      DATA.pricing.steps.forEach(function (s) {
        var card = el("div", "price-step price-step--" + s.state);
        card.appendChild(el("p", "price-stage", s.stage));
        card.appendChild(el("p", "price-coupang", s.coupang));
        card.appendChild(el("p", "price-naver", "네이버 " + s.naver));
        card.appendChild(el("p", "price-cond", s.condition));
        root.appendChild(card);
      });
    }
    var rules = $("price-rules");
    if (rules) {
      clear(rules);
      DATA.pricing.rules.forEach(function (r) { rules.appendChild(el("li", null, r)); });
    }
  }

  function renderMargin() {
    var body = $("margin-body");
    if (!body) return;
    clear(body);
    var cost = Number(state.cost) || 0;
    marginRows(cost, state.sellerLink).forEach(function (r) {
      var tr = document.createElement("tr");
      tr.setAttribute("data-row", r.id);
      tr.appendChild(el("td", "stage", r.stage));
      tr.appendChild(el("td", "chan chan--" + r.channel, r.label));
      tr.appendChild(el("td", "num", won(r.price)));
      tr.appendChild(el("td", "num", "−" + num(r.fee)));
      tr.appendChild(el("td", "num", r.logistics ? "−" + num(r.logistics) : "—"));
      var netCell = el("td", "num net", won(r.net));
      if (r.net < 0) netCell.className = "num net is-negative";
      tr.appendChild(netCell);
      tr.appendChild(el("td", "num rate", pct(r.rate)));
      body.appendChild(tr);
    });

    var note = $("margin-note");
    if (note) note.textContent = DATA.margin.note;

    var foot = $("margin-foot");
    if (foot) {
      var pace = DATA.margin.pace;
      var monthly = Math.round((pace.orders / pace.days) * 30 * 10) / 10;
      var step1 = marginRows(cost, state.sellerLink).filter(function (r) { return r.id === "cp-1"; })[0];
      var msg = pace.note + " · 1단계(39,000원) 적용 시 월 매출 약 " +
        num(Math.round(step1.price * monthly / 1000) * 1000) + "원";
      if (!cost) msg += " · ⚠️ 원가를 입력하기 전이라 순마진이 실제보다 크게 보입니다.";
      foot.textContent = msg;
    }
  }

  function renderSeo() {
    if ($("seo-lead")) $("seo-lead").textContent = DATA.seo.lead;

    var names = $("name-list");
    if (names) {
      clear(names);
      DATA.seo.names.forEach(function (n) {
        var row = el("div", "name-row");
        var top = el("div", "name-top");
        top.appendChild(el("span", "name-label", n.label));
        top.appendChild(copyButton("상품명 복사", function () { return n.text; }, "상품명을 복사했어요 — 등록 화면에 붙여넣으세요."));
        row.appendChild(top);
        row.appendChild(el("p", "name-text", n.text));
        row.appendChild(el("p", "name-note", n.note));
        names.appendChild(row);
      });
    }

    var avoid = $("name-avoid");
    if (avoid) {
      clear(avoid);
      DATA.seo.names_avoid.forEach(function (a) { avoid.appendChild(el("li", null, a)); });
    }

    var sets = $("tag-sets");
    if (sets) {
      clear(sets);
      ["wedding", "daily"].forEach(function (key) {
        var t = DATA.seo.tags[key];
        var block = el("div", "tag-block");
        var head = el("div", "tag-head");
        head.appendChild(el("p", "tag-label", t.label));
        head.appendChild(copyButton("태그 복사", function () { return t.items.join(", "); }, "태그 10개를 복사했어요 — 쉼표 그대로 붙여넣으세요."));
        block.appendChild(head);
        var chips = el("ul", "chips");
        t.items.forEach(function (item) { chips.appendChild(el("li", "chip", item)); });
        block.appendChild(chips);
        sets.appendChild(block);
      });
      sets.appendChild(el("p", "note-line", DATA.seo.tags.never));
    }

    var thumb = $("thumb-card");
    if (thumb) {
      clear(thumb);
      thumb.appendChild(el("h4", "card-title", DATA.seo.thumbnail.title));
      var ul = el("ul", "dash-list");
      DATA.seo.thumbnail.items.forEach(function (i) { ul.appendChild(el("li", null, i)); });
      thumb.appendChild(ul);
    }

    var bg = $("banner-grid");
    if (bg) {
      clear(bg);
      DATA.seo.banner.forEach(function (b) {
        var card = el("article", "banner-card");
        card.appendChild(el("p", "banner-head", b.head));
        card.appendChild(el("p", "banner-sub", b.sub));
        var foot = el("div", "banner-foot");
        foot.appendChild(el("span", "banner-cta", b.cta));
        foot.appendChild(copyButton("카피 복사", function () { return bannerText(b); }, "배너 카피를 복사했어요."));
        card.appendChild(foot);
        bg.appendChild(card);
      });
    }
    if ($("banner-note")) $("banner-note").textContent = DATA.seo.banner_note;

    var cl = $("seo-checklist");
    if (cl) {
      clear(cl);
      DATA.seo.checklist.forEach(function (c) { cl.appendChild(el("li", null, c)); });
    }
  }

  function renderBench() {
    var root = $("bench-grid");
    if (!root) return;
    clear(root);
    DATA.benchmarks.forEach(function (b) {
      var card = el("article", "bench");
      card.setAttribute("data-bench", b.id);
      var head = el("div", "bench-head");
      head.appendChild(el("h4", "bench-name", b.name));
      head.appendChild(el("span", "bench-handle", b.handle));
      card.appendChild(head);
      card.appendChild(el("p", "bench-scale", b.scale));
      var dl = el("dl", "bench-dl");
      [["강점", b.strength], ["콘텐츠", b.content], ["적용", b.apply]].forEach(function (pair) {
        dl.appendChild(el("dt", null, pair[0]));
        dl.appendChild(el("dd", null, pair[1]));
      });
      card.appendChild(dl);
      root.appendChild(card);
    });

    var rules = $("rule-grid");
    if (rules) {
      clear(rules);
      DATA.benchmark_rules.forEach(function (r) {
        var card = el("div", "rule");
        card.appendChild(el("span", "rule-n", r.n));
        card.appendChild(el("p", "rule-title", r.title));
        card.appendChild(el("p", "rule-detail", r.detail));
        rules.appendChild(card);
      });
    }
  }

  function renderSeasons() {
    var root = $("season-list");
    if (root) {
      clear(root);
      DATA.seasons.forEach(function (s) {
        var card = el("article", "season season--" + s.state);
        var head = el("div", "season-head");
        head.appendChild(el("span", "season-period", s.period));
        head.appendChild(el("h4", "season-title", s.title));
        if (s.state === "now") head.appendChild(el("span", "pill pill--now", "지금"));
        card.appendChild(head);
        card.appendChild(el("p", "season-target", "타깃 · " + s.target));

        var cols = el("div", "season-cols");
        var pcol = el("div", "season-col");
        pcol.appendChild(el("h5", null, "상품"));
        var pul = el("ul", "dash-list");
        s.products.forEach(function (p) { pul.appendChild(el("li", null, p)); });
        pcol.appendChild(pul);
        cols.appendChild(pcol);

        var acol = el("div", "season-col");
        acol.appendChild(el("h5", null, "실행"));
        var aul = el("ul", "dash-list");
        s.actions.forEach(function (a) { aul.appendChild(el("li", null, a)); });
        acol.appendChild(aul);
        cols.appendChild(acol);
        card.appendChild(cols);

        var foot = el("div", "season-foot");
        foot.appendChild(el("span", "deadline", "⏳ " + s.deadline));
        foot.appendChild(el("span", "season-kpi", "KPI · " + s.kpi));
        card.appendChild(foot);
        root.appendChild(card);
      });
    }

    var reels = $("reel-list");
    if (reels) {
      clear(reels);
      DATA.reels.forEach(function (r) {
        var card = el("article", "reel");
        card.setAttribute("data-reel", r.id);
        var head = el("div", "reel-head");
        head.appendChild(el("h4", "reel-title", r.title));
        head.appendChild(el("span", "pill", r.length + " · " + r.when));
        head.appendChild(copyButton("콘티 복사", function () { return buildReelCopy(r); }, "30초 콘티를 복사했어요 — 촬영·편집에 그대로 쓰세요."));
        card.appendChild(head);
        card.appendChild(el("p", "reel-hook", "첫 3초 훅 · " + r.hook));

        var table = el("table", "reel-table");
        var thead = document.createElement("thead");
        var htr = document.createElement("tr");
        ["시간", "화면", "자막"].forEach(function (h) {
          var th = document.createElement("th");
          th.setAttribute("scope", "col");
          th.textContent = h;
          htr.appendChild(th);
        });
        thead.appendChild(htr);
        table.appendChild(thead);
        var tbody = document.createElement("tbody");
        r.scenes.forEach(function (s) {
          var tr = document.createElement("tr");
          tr.appendChild(el("td", "t", s.t));
          tr.appendChild(el("td", null, s.shot));
          tr.appendChild(el("td", "cap", "\"" + s.caption + "\""));
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        card.appendChild(table);
        card.appendChild(el("p", "reel-cta", "CTA · " + r.cta));
        reels.appendChild(card);
      });
    }
  }

  function renderPrompts() {
    var root = $("prompt-list");
    if (!root) return;
    clear(root);
    DATA.prompts.forEach(function (p) {
      var card = el("article", "prompt");
      card.setAttribute("data-prompt", p.id);
      var head = el("div", "prompt-head");
      head.appendChild(el("h4", "prompt-title", p.title));
      head.appendChild(el("span", "prompt-use", p.use));
      head.appendChild(copyButton("프롬프트 복사", function () { return p.prompt; }, "프롬프트를 복사했어요 — GPT에 붙여넣고 실행하세요."));
      card.appendChild(head);
      var pre = document.createElement("pre");
      pre.className = "prompt-body";
      pre.textContent = p.prompt;
      card.appendChild(pre);
      card.appendChild(el("p", "prompt-tip", "💡 " + p.tips));
      root.appendChild(card);
    });

    var jc = $("json-card");
    if (jc) {
      clear(jc);
      jc.appendChild(el("h4", "card-title", DATA.json_guide.title));
      var urlRow = el("div", "json-url-row");
      var code = document.createElement("code");
      code.className = "json-url";
      code.textContent = DATA.json_guide.url;
      urlRow.appendChild(code);
      urlRow.appendChild(copyButton("URL 복사", function () { return DATA.json_guide.url; }, "JSON 주소를 복사했어요."));
      jc.appendChild(urlRow);

      var dl = el("dl", "json-fields");
      DATA.json_guide.fields.forEach(function (f) {
        dl.appendChild(el("dt", null, f.key));
        dl.appendChild(el("dd", null, f.desc));
      });
      jc.appendChild(dl);

      var exWrap = el("div", "json-example");
      var exHead = el("div", "json-example-head");
      exHead.appendChild(el("span", "json-example-label", "GPT에 이렇게 시키면 됩니다"));
      exHead.appendChild(copyButton("예시 복사", function () { return DATA.json_guide.example; }, "예시 문장을 복사했어요."));
      exWrap.appendChild(exHead);
      var quote = el("p", "json-example-text", DATA.json_guide.example);
      exWrap.appendChild(quote);
      jc.appendChild(exWrap);
    }
  }

  /* ---------- 탭 ---------- */
  var TAB_IDS = ["today", "seo", "bench", "season", "gpt"];
  function setTab(key, scroll) {
    if (TAB_IDS.indexOf(key) < 0) key = "today";
    state.tab = key;
    TAB_IDS.forEach(function (k) {
      var btn = $("tab-" + k);
      var panel = $("panel-" + k);
      var on = k === key;
      if (btn) {
        btn.className = on ? "tab is-active" : "tab";
        btn.setAttribute("aria-selected", on ? "true" : "false");
        btn.setAttribute("tabindex", on ? "0" : "-1");
      }
      if (panel) panel.hidden = !on;
    });
    if (scroll && $("tab-bar") && $("tab-bar").scrollIntoView) {
      $("tab-bar").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
  function bindTabs() {
    TAB_IDS.forEach(function (k) {
      var btn = $("tab-" + k);
      if (!btn) return;
      btn.addEventListener("click", function () { setTab(k); });
    });
    document.addEventListener("click", function (ev) {
      var t = ev.target;
      if (!t || !t.getAttribute) return;
      var goto = t.getAttribute("data-goto");
      if (goto) { setTab(goto); return; }
      var anchor = t.getAttribute("data-goto-anchor");
      if (anchor) {
        var target = $(anchor);
        if (target && target.scrollIntoView) target.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  }

  /* ---------- 데이터 로드 ---------- */
  function start(data) {
    DATA = data;
    state.done = load(KEY_TASK, {});
    state.riskDone = load(KEY_RISK, {});
    state.cost = load(KEY_COST, 0) || 0;
    var linkSaved = load(KEY_LINK, false);
    state.sellerLink = !!linkSaved;

    renderMeta();
    renderKpis();
    renderStrategy();
    renderDiag();
    renderTasks();
    renderRisk();
    renderPricing();
    renderMargin();
    renderSeo();
    renderBench();
    renderSeasons();
    renderPrompts();
    bindTabs();
    setTab("today");

    var costInput = $("cost-input");
    if (costInput) {
      if (state.cost) costInput.value = String(state.cost);
      costInput.addEventListener("input", function () {
        state.cost = Number(costInput.value) || 0;
        save(KEY_COST, state.cost);
        renderMargin();
      });
    }
    var seller = $("seller-link");
    if (seller) {
      seller.checked = state.sellerLink;
      seller.addEventListener("change", function () {
        state.sellerLink = !!seller.checked;
        save(KEY_LINK, state.sellerLink);
        renderMargin();
      });
    }
  }

  function boot() {
    if (window.__BERAINBOW_DATA__) { start(window.__BERAINBOW_DATA__); return; }
    try {
      fetch("./data/dashboard.json", { cache: "no-store" })
        .then(function (r) { return r.json(); })
        .then(function (data) { start(data); })
        .catch(function () { fail(); });
    } catch (e) { fail(); }
  }
  function fail() {
    var status = $("status");
    if (status) status.textContent = "데이터를 불러오지 못했습니다. 새로고침하거나 dashboard.json을 직접 열어 보세요.";
  }

  /* 테스트·외부 연동용 */
  window.__BERAINBOW__ = {
    getData: function () { return DATA; },
    getState: function () { return state; },
    marginRows: marginRows,
    won: won,
    buildReelCopy: buildReelCopy,
    setTab: setTab
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
