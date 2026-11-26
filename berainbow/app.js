/* 비더레인보우 사업 대시보드 — app.js (빌드 도구 없음, 데이터는 data/dashboard.json) */
(function () {
  "use strict";

  var KEY_TASK = "berainbow.tasks.v1";
  var KEY_RISK = "berainbow.risk.v1";
  var KEY_COST = "berainbow.cost.v1";
  var KEY_LINK = "berainbow.sellerlink.v1";
  var KEY_SHARE = "berainbow.share.v1";

  var state = {
    tab: "today",
    done: {},
    riskDone: {},
    cost: 0,
    sellerLink: false,
    share: 70
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
  function sharePct() {
    var fallback = (DATA && DATA.share) ? Number(DATA.share.default_pct) : 50;
    var v = Number(state.share);
    if (!isFinite(v)) v = fallback;
    return Math.min(100, Math.max(0, v));
  }

  function marginRows(cost, sellerLink, share) {
    if (!DATA) return [];
    var a = DATA.margin.assumptions;
    var c = Number(cost) || 0;
    var p = (share === undefined) ? sharePct() : Number(share);
    if (!isFinite(p)) p = sharePct();
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
      var kind = r.share || (r.channel === "coupang" ? "joint" : "sole");
      var mine = kind === "joint" ? Math.round(net * p / 100) : Math.round(net);
      return {
        id: r.id, channel: r.channel, label: r.label, stage: r.stage, price: price,
        fee: Math.round(fee), logistics: logistics, net: Math.round(net),
        rate: price ? net / price : 0, shareKind: kind, mine: mine, minePct: kind === "joint" ? p : 100
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

  /* ---------- 수익 배분 비율 ---------- */
  var shareHints = [];
  function shareInputNodes() {
    var out = [];
    ["share-input", "share-strategy-input"].forEach(function (id) {
      var n = $(id);
      if (n) out.push(n);
    });
    return out;
  }
  function setShare(raw) {
    var v = Number(raw);
    if (raw === "" || !isFinite(v)) v = (DATA && DATA.share) ? Number(DATA.share.default_pct) : 50;
    v = Math.min(100, Math.max(0, v));
    state.share = v;
    save(KEY_SHARE, v);
    var active = document.activeElement || null;
    shareInputNodes().forEach(function (n) { if (n !== active) n.value = String(v); });
    shareHints.forEach(function (h) {
      h.textContent = DATA.share.strategy_line.replace("{share}", v);
    });
    renderMargin();
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
      dday = diff > 0 ? " · D-" + diff : diff === 0 ? " · 오늘" : "";
    } catch (e) { dday = ""; }
    if ($("next-update")) $("next-update").textContent = "다음 업데이트 " + m.next_update_label + dday;
    if ($("json-link")) $("json-link").setAttribute("href", m.json_path);
    if ($("sheet-link") && m.sheet_url) $("sheet-link").setAttribute("href", m.sheet_url);
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

  function renderOps() {
    var root = $("ops-card");
    if (!root || !DATA.ops) return;
    clear(root);
    var o = DATA.ops;

    var head = el("div", "ops-head");
    head.appendChild(el("h3", "ops-title", o.title));
    var link = el("a", "ops-link", "📊 " + o.link_label);
    link.href = o.url;
    link.setAttribute("href", o.url);
    link.target = "_blank";
    link.rel = "noopener";
    link.setAttribute("data-ops-link", o.sheet_name);
    head.appendChild(link);
    root.appendChild(head);
    root.appendChild(el("p", "ops-lead", o.lead));

    var tiles = el("div", "ops-tiles");
    o.tiles.forEach(function (t) {
      var card = el("article", "ops-tile ops-tile--" + t.tone);
      card.setAttribute("data-ops", t.id);
      card.appendChild(el("p", "ops-label", t.label));
      var val = el("p", "ops-value");
      val.appendChild(el("span", "ops-count", t.value));
      if (t.amount) val.appendChild(el("span", "ops-amount", t.amount));
      card.appendChild(val);
      card.appendChild(el("p", "ops-sub", t.sub));
      tiles.appendChild(card);
    });
    root.appendChild(tiles);
    root.appendChild(el("p", "ops-note", o.note));
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
      if (s.id === "rocket" && DATA.share) {
        var box = el("div", "share-box");
        var label = el("label", "field");
        label.setAttribute("for", "share-strategy-input");
        label.appendChild(el("span", "field-label", DATA.share.label + " — 쿠팡 공동 운영"));
        var wrap = el("span", "field-inputwrap");
        var inp = document.createElement("input");
        inp.type = "number";
        inp.id = "share-strategy-input";
        inp.setAttribute("inputmode", "numeric");
        inp.min = String(DATA.share.min);
        inp.max = String(DATA.share.max);
        inp.step = String(DATA.share.step);
        inp.value = String(sharePct());
        wrap.appendChild(inp);
        wrap.appendChild(el("span", "field-unit", "%"));
        label.appendChild(wrap);
        box.appendChild(label);
        var hint = el("p", "share-hint", DATA.share.strategy_line.replace("{share}", sharePct()));
        box.appendChild(hint);
        shareHints.push(hint);
        card.appendChild(box);
        inp.addEventListener("input", function () { setShare(inp.value); });
        inp.addEventListener("change", function () { setShare(inp.value); });
      }
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
      label.appendChild(el("span", "visually-hidden", c.title));
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

  function renderCostPresets() {
    var root = $("cost-presets");
    if (!root || !DATA || !DATA.margin.presets) return;
    clear(root);
    DATA.margin.presets.forEach(function (p) {
      var isCustom = (p.cost === null || p.cost === undefined);
      var b = el("button", "preset-btn");
      b.type = "button";
      b.setAttribute("data-preset", p.id);
      b.textContent = isCustom ? p.label : p.label + " " + num(p.cost) + "원";
      if (p.note) b.setAttribute("title", p.note);
      if (!isCustom && Number(state.cost) === Number(p.cost)) b.className = "preset-btn is-active";
      b.addEventListener("click", function () {
        var input = $("cost-input");
        if (isCustom) {
          state.cost = 0;
          save(KEY_COST, 0);
          if (input) {
            input.value = "";
            try { input.focus(); } catch (e) {}
          }
        } else {
          state.cost = Number(p.cost);
          save(KEY_COST, state.cost);
          if (input) input.value = String(state.cost);
        }
        renderMargin();
        renderCostPresets();
      });
      root.appendChild(b);
    });
    if (DATA.margin.cost_note && !$("cost-note")) {
      var note = el("p", "cost-note", DATA.margin.cost_note);
      note.id = "cost-note";
      root.appendChild(note);
    }
  }

  function renderMargin() {
    var body = $("margin-body");
    if (!body) return;
    clear(body);
    var cost = Number(state.cost) || 0;
    var share = sharePct();
    var rows = marginRows(cost, state.sellerLink, share);
    rows.forEach(function (r) {
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
      var mineCell = el("td", "num mine", won(r.mine));
      if (r.mine < 0) mineCell.className = "num mine is-negative";
      mineCell.appendChild(el("span", "mine-tag", r.shareKind === "joint" ? "배분 " + r.minePct + "%" : "단독 100%"));
      tr.appendChild(mineCell);
      body.appendChild(tr);
    });

    var note = $("margin-note");
    if (note) note.textContent = DATA.margin.note;

    var foot = $("margin-foot");
    if (foot) {
      var pace = DATA.margin.pace;
      var monthly = Math.round((pace.orders / pace.days) * 30 * 10) / 10;
      var step1 = marginRows(cost, state.sellerLink, share).filter(function (r) { return r.id === "cp-1"; })[0];
      var msg = pace.note + " · 1단계(39,000원) 적용 시 월 매출 약 " +
        num(Math.round(step1.price * monthly / 1000) * 1000) + "원";
      if (!cost) msg += " · ⚠️ 원가가 0원이라 순마진이 실제보다 크게 보입니다 — 원가를 입력하세요.";
      msg += " · 쿠팡 행은 순이익의 " + share + "%만 내 정산(공동 운영) — 네이버·인스타그램 유입은 단독 채널로 100%.";
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

  /* ---------- 대상 제품 선택 · 프롬프트 실시간 치환 ---------- */
  var KEY_PROMPT_TARGET = "berainbow.prompt.target.v1";
  /* + 신규 상품 — 직접 등록한 상품(이 브라우저에 영구 저장) */
  var KEY_CUSTOM_PRODUCTS = "berainbow.prompt.customProducts.v1";
  var PROMPT_FIELD_KEYS = ["name", "spec", "price", "target", "keyword"];
  var PROMPT_VALUE_KEYS = ["name", "spec", "price", "target", "keyword", "options", "shipping", "faq", "theme"];
  var promptTarget = null;

  function promptData() { return (DATA && DATA.prompt_products) ? DATA.prompt_products : null; }
  function promptDefaults() {
    var d = promptData() && promptData().defaults;
    return d || {};
  }
  function presetPromptItems() {
    var d = promptData();
    return (d && d.items) ? d.items : [];
  }
  function customLabel() {
    var d = promptData();
    return (d && d.custom_label) || "직접 입력";
  }
  function customNote() {
    var d = promptData();
    return (d && d.custom_note) || "";
  }
  /* 단가·마진 탭에서 저장한 제품(localStorage)을 같은 목록에 합칩니다. */
  function savedPromptItems() {
    return products.map(function (p) {
      return {
        id: "saved:" + p.id,
        group: "saved",
        label: p.name,
        chip_label: p.name,
        chip: false,
        badge: "저장",
        name: p.name,
        spec: "",
        price: p.price ? won(p.price) : "",
        target: "",
        keyword: p.name,
        options: "",
        shipping: "",
        faq: "",
        theme: "",
        note: (promptData() && promptData().saved_note) || ""
      };
    });
  }
  /* '+ 신규 상품'으로 직접 등록한 제품 — localStorage 에 영구 저장 */
  function customProductList() {
    var raw = load(KEY_CUSTOM_PRODUCTS, []);
    if (!raw || typeof raw !== "object" || !raw.length) return [];
    return raw.filter(function (p) { return p && p.id && String(p.name || "").trim(); });
  }
  function saveCustomProductList(list) { save(KEY_CUSTOM_PRODUCTS, list); }
  function customPromptItem(p) {
    return {
      id: "mine:" + p.id,
      group: "mine",
      chip: true,
      badge: "내 상품",
      label: p.name,
      chip_label: p.name,
      name: p.name,
      spec: p.spec || "",
      price: p.price || "",
      target: p.target || "",
      keyword: p.keyword || "",
      options: p.options || "",
      shipping: p.shipping || "",
      faq: p.faq || "",
      theme: p.theme || "",
      note: (promptData() && promptData().registered_note) || ""
    };
  }
  function customPromptItems() { return customProductList().map(customPromptItem); }
  function isMineId(id) { return String(id || "").indexOf("mine:") === 0; }
  function allPromptItems() {
    return presetPromptItems().concat(customPromptItems()).concat(savedPromptItems());
  }
  function findPromptItem(id) {
    var list = allPromptItems(), i;
    for (i = 0; i < list.length; i++) { if (list[i].id === id) return list[i]; }
    return null;
  }
  /* 제품 항목 → 프롬프트에 들어갈 값. 빈 값은 기본값으로 메움 */
  function resolvePromptTarget(src) {
    var base = src || promptTarget || presetPromptItems()[0] || {};
    var d = promptDefaults();
    var out = {};
    PROMPT_VALUE_KEYS.forEach(function (k) {
      var v = base[k];
      out[k] = (v === undefined || v === null || String(v).trim() === "") ? (d[k] || "") : String(v);
    });
    out.id = base.id || "custom";
    out.group = base.group || "custom";
    out.label = base.label || out.name;
    out.note = base.note || "";
    return out;
  }
  function promptTemplates() {
    if (DATA && DATA.prompt_templates && DATA.prompt_templates.length) return DATA.prompt_templates;
    return (DATA && DATA.prompts) ? DATA.prompts : [];
  }
  /* 템플릿의 {name} {spec} {price} {target} {keyword} … 를 현재 제품 값으로 치환 */
  function buildPrompt(p) {
    var t = resolvePromptTarget();
    var tpl = (p && (p.template || p.prompt)) || "";
    var d = promptDefaults();
    var values = {
      name: t.name, spec: t.spec, price: t.price, target: t.target, keyword: t.keyword,
      options: t.options, shipping: t.shipping, faq: t.faq, theme: t.theme, season: d.season || ""
    };
    return String(tpl).replace(/\{(\w+)\}/g, function (whole, key) {
      return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : whole;
    });
  }
  function persistPromptTarget() {
    if (!promptTarget) return;
    if (promptTarget.id === "custom") {
      var values = {};
      PROMPT_VALUE_KEYS.forEach(function (k) {
        values[k] = (promptTarget[k] === undefined || promptTarget[k] === null) ? "" : String(promptTarget[k]);
      });
      save(KEY_PROMPT_TARGET, { id: "custom", values: values, draft: !!promptTarget.draft });
    } else {
      save(KEY_PROMPT_TARGET, { id: promptTarget.id });
    }
  }
  function loadPromptTarget() {
    var saved = load(KEY_PROMPT_TARGET, null);
    if (saved && saved.id) {
      if (saved.id === "custom" && saved.values) {
        /* '+ 신규 상품'으로 시작한 빈 칸은 빈 칸 그대로 복원 */
        if (saved.draft) {
          var draft = { id: "custom", group: "custom", label: customLabel(), note: newPromptNote(), draft: true };
          PROMPT_VALUE_KEYS.forEach(function (k) {
            var v = saved.values[k];
            draft[k] = (v === undefined || v === null) ? "" : String(v);
          });
          return draft;
        }
        return resolvePromptTarget(saved.values);
      }
      var item = findPromptItem(saved.id);
      if (item) return resolvePromptTarget(item);
    }
    return resolvePromptTarget(null);
  }

  /* 빈 값이면 안내 문구로 채워 보여 줄 때 쓰는 현재 대상 이름 */
  function promptDisplayName() {
    var t = promptTarget || {};
    var name = (t.name === undefined || t.name === null) ? "" : String(t.name).trim();
    return name || (promptDefaults().name || "새 제품");
  }
  function setPromptFieldValues() {
    var t = promptTarget || {};
    PROMPT_FIELD_KEYS.forEach(function (k) {
      var n = $("prompt-" + k);
      var v = (t[k] === undefined || t[k] === null) ? "" : String(t[k]);
      if (n && n.value !== v) n.value = v;
    });
    var note = $("prompt-note");
    if (note) {
      if (t.note) { note.textContent = t.note; note.hidden = false; }
      else { note.textContent = ""; note.hidden = true; }
    }
    var cur = $("prompt-current");
    if (cur) cur.textContent = "지금 대상 · " + promptDisplayName();
    updatePromptActions();
  }
  /* 직접 등록한 상품을 고른 상태에서만 [삭제] 버튼 노출 */
  function updatePromptActions() {
    var del = $("prompt-delete");
    if (!del) return;
    var mine = !!(promptTarget && isMineId(promptTarget.id));
    del.hidden = !mine;
    if (mine) del.textContent = (promptData() && promptData().delete_label) || "🗑 등록 상품 삭제";
  }

  function promptChip(id, label, badge) {
    var b = el("button", "pt-chip");
    b.type = "button";
    b.setAttribute("data-prompt-chip", id);
    if (promptTarget && promptTarget.id === id) b.className = "pt-chip is-active";
    b.appendChild(el("span", "pt-chip-label", label));
    b.appendChild(el("span", "pt-chip-badge", badge));
    b.addEventListener("click", function () { applyPromptItem(id); });
    return b;
  }

  function renderPromptChips() {
    var root = $("prompt-chips");
    if (!root) return;
    clear(root);
    presetPromptItems().forEach(function (it) {
      if (!it.chip) return;
      root.appendChild(promptChip(it.id, it.chip_label || it.label, it.badge || "프리셋"));
    });
    /* 내가 등록한 신규 상품 — 저장한 순서대로 칩에 나열 */
    customPromptItems().forEach(function (it) {
      root.appendChild(promptChip(it.id, it.chip_label || it.label, it.badge || "내 상품"));
    });
    /* 5번째 버튼 — 직접 입력 초기화 */
    var d = promptData() || {};
    var nb = el("button", "pt-chip pt-chip--new");
    nb.type = "button";
    nb.setAttribute("data-prompt-new", "1");
    nb.appendChild(el("span", "pt-chip-label", d.new_chip_label || "+ 신규 상품"));
    nb.appendChild(el("span", "pt-chip-badge", d.new_badge || "직접 입력"));
    nb.addEventListener("click", startNewPrompt);
    root.appendChild(nb);
  }

  function renderPromptSelect() {
    var sel = $("prompt-product");
    if (!sel) return;
    clear(sel);
    var groups = (promptData() && promptData().groups) || [];
    var byGroup = {};
    allPromptItems().forEach(function (it) {
      var g = it.group || "preset";
      if (!byGroup[g]) byGroup[g] = [];
      byGroup[g].push(it);
    });
    groups.forEach(function (g) {
      var list = byGroup[g.id] || [];
      if (!list.length) return;
      var og = document.createElement("optgroup");
      og.setAttribute("label", g.label);
      list.forEach(function (it) {
        var o = document.createElement("option");
        o.value = it.id;
        o.textContent = it.label + (it.badge ? " · " + it.badge : "");
        og.appendChild(o);
      });
      sel.appendChild(og);
    });
    var custom = document.createElement("option");
    custom.value = "custom";
    custom.textContent = customLabel();
    sel.appendChild(custom);
    var want = (promptTarget && promptTarget.id) ? promptTarget.id : "custom";
    sel.value = want;
    if (sel.value !== want) sel.value = "custom";
  }

  function applyPromptItem(id) {
    var item = (id === "custom") ? null : findPromptItem(id);
    if (id === "custom" || !item) {
      var cur = resolvePromptTarget();
      var next = {};
      PROMPT_VALUE_KEYS.forEach(function (k) { next[k] = cur[k]; });
      next.id = "custom";
      next.group = "custom";
      next.label = customLabel();
      next.note = customNote();
      promptTarget = next;
    } else {
      promptTarget = resolvePromptTarget(item);
    }
    persistPromptTarget();
    renderPromptChips();
    renderPromptSelect();
    setPromptFieldValues();
    renderPrompts();
    toast("프롬프트 4종을 '" + promptDisplayName() + "' 기준으로 바꿨어요.");
  }

  /* ---------- + 신규 상품 : 빈 칸으로 시작 · 등록 · 삭제 ---------- */
  function newPromptNote() {
    var d = promptData();
    return (d && d.new_note) || "";
  }
  function blankPromptTarget() {
    var t = { id: "custom", group: "custom", label: customLabel(), note: newPromptNote(), draft: true };
    PROMPT_VALUE_KEYS.forEach(function (k) { t[k] = ""; });
    return t;
  }
  function focusPromptName() {
    var n = $("prompt-name");
    if (n && n.focus) { try { n.focus(); } catch (e) { /* 구형 브라우저 */ } }
  }
  /* '+ 신규 상품' 칩 — 입력칸 5개를 비우고 직접 입력으로 전환 */
  function startNewPrompt() {
    promptTarget = blankPromptTarget();
    persistPromptTarget();
    renderPromptChips();
    renderPromptSelect();
    setPromptFieldValues();
    renderPrompts();
    focusPromptName();
    toast("새 상품 입력을 시작했어요. 상품명부터 채우고 [💾 신규 상품으로 등록]을 눌러 주세요.");
  }
  /* 입력칸 5개 + 숨은 값(선택 기준·배송 등)을 합친 현재 값 */
  function currentPromptValues() {
    var t = promptTarget || {};
    var out = {};
    PROMPT_VALUE_KEYS.forEach(function (k) {
      out[k] = (t[k] === undefined || t[k] === null) ? "" : String(t[k]);
    });
    PROMPT_FIELD_KEYS.forEach(function (k) {
      var n = $("prompt-" + k);
      if (n) out[k] = String(n.value === undefined || n.value === null ? "" : n.value);
    });
    return out;
  }
  /* [💾 신규 상품으로 등록] — 상품명이 있으면 localStorage 에 저장 후 바로 선택 */
  function registerCustomProduct() {
    var values = currentPromptValues();
    var name = String(values.name || "").trim();
    if (!name) {
      toast("상품명을 먼저 입력해 주세요.");
      focusPromptName();
      return;
    }
    values.name = name;
    var list = customProductList();
    var found = null, i;
    for (i = 0; i < list.length; i++) {
      if (String(list[i].name || "").trim() === name) { found = list[i]; break; }
    }
    var updated = !!found;
    if (!found) {
      found = { id: "cp" + Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36) };
      list.push(found);
    }
    PROMPT_VALUE_KEYS.forEach(function (k) { found[k] = values[k]; });
    found.name = name;
    saveCustomProductList(list);
    promptTarget = resolvePromptTarget(customPromptItem(found));
    persistPromptTarget();
    renderPromptChips();
    renderPromptSelect();
    setPromptFieldValues();
    renderPrompts();
    toast(updated
      ? "같은 이름의 상품을 새 내용으로 업데이트했어요 — 목록과 칩에 반영했습니다."
      : "'" + name + "'을(를) 신규 상품으로 등록했어요 — 목록과 칩에서 다시 불러올 수 있습니다.");
  }
  /* [삭제] — 지금 고른 등록 상품만 목록에서 제거 */
  function deleteCustomProduct() {
    if (!promptTarget || !isMineId(promptTarget.id)) return;
    var id = promptTarget.id.slice("mine:".length);
    var list = customProductList();
    var target = null, i;
    for (i = 0; i < list.length; i++) { if (list[i].id === id) { target = list[i]; break; } }
    if (!target) return;
    var msg = "'" + target.name + "'을(를) 등록 목록에서 삭제할까요?";
    if (typeof window.confirm === "function" && !window.confirm(msg)) return;
    saveCustomProductList(list.filter(function (p) { return p.id !== id; }));
    promptTarget = resolvePromptTarget(presetPromptItems()[0] || null);
    persistPromptTarget();
    renderPromptChips();
    renderPromptSelect();
    setPromptFieldValues();
    renderPrompts();
    toast("등록한 신규 상품을 삭제했어요.");
  }

  /* 단가 탭에서 제품을 저장·삭제하면 대상 목록을 다시 맞춥니다. */
  function refreshPromptOptions() {
    if (!DATA || !$("prompt-product") || !promptTarget) return;
    var missing = (promptTarget.id !== "custom") && !findPromptItem(promptTarget.id);
    if (missing) {
      promptTarget = resolvePromptTarget(presetPromptItems()[0] || null);
      persistPromptTarget();
      setPromptFieldValues();
      renderPrompts();
    }
    renderPromptChips();
    renderPromptSelect();
  }

  function renderPrompts() {
    var root = $("prompt-list");
    if (!root) return;
    clear(root);
    promptTemplates().forEach(function (p) {
      if (!p || !p.id) return;
      var card = el("article", "prompt");
      card.setAttribute("data-prompt", p.id);
      var head = el("div", "prompt-head");
      head.appendChild(el("h4", "prompt-title", p.title || p.id));
      if (p.use) head.appendChild(el("span", "prompt-use", p.use));
      head.appendChild(copyButton("프롬프트 복사", function () { return buildPrompt(p); }, "프롬프트를 복사했어요 — GPT에 붙여넣고 실행하세요."));
      card.appendChild(head);

      var t = resolvePromptTarget();
      var tag = el("p", "prompt-target-tag");
      tag.setAttribute("data-prompt-target", p.id);
      tag.textContent = "대상 제품 · " + t.name + (t.price ? " · " + t.price : "");
      card.appendChild(tag);

      var pre = document.createElement("pre");
      pre.className = "prompt-body";
      pre.setAttribute("data-prompt-body", p.id);
      pre.textContent = buildPrompt(p);
      card.appendChild(pre);
      if (p.tips) card.appendChild(el("p", "prompt-tip", "💡 " + p.tips));
      root.appendChild(card);
    });
  }

  function renderJsonCard() {
    var jc = $("json-card");
    if (!jc) return;
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

  function bindPrompts() {
    if (!DATA) return;
    promptTarget = loadPromptTarget();
    var d = promptData();
    if ($("prompt-lead")) $("prompt-lead").textContent = (d && d.lead) || "";
    if ($("prompt-hint")) $("prompt-hint").textContent = (d && d.weekly_note) || "";
    if ($("prompt-weekly") && d && d.weekly_notice) {
      $("prompt-weekly").textContent = "🗓 " + d.weekly_notice;
    }
    if ($("prompt-register")) $("prompt-register").textContent = (d && d.register_label) || "💾 신규 상품으로 등록";
    if ($("prompt-register-hint")) $("prompt-register-hint").textContent = (d && d.register_hint) || "";
    updatePromptActions();
    var sel = $("prompt-product");
    if (sel) {
      sel.addEventListener("change", function () { applyPromptItem(sel.value); });
    }
    var reg = $("prompt-register");
    if (reg) reg.addEventListener("click", registerCustomProduct);
    var del = $("prompt-delete");
    if (del) del.addEventListener("click", deleteCustomProduct);
    PROMPT_FIELD_KEYS.forEach(function (k) {
      var n = $("prompt-" + k);
      if (!n) return;
      n.addEventListener("input", function () {
        if (!promptTarget) promptTarget = resolvePromptTarget(null);
        var wasDraft = !!promptTarget.draft;
        promptTarget[k] = n.value;
        promptTarget.id = "custom";
        promptTarget.group = "custom";
        promptTarget.label = customLabel();
        promptTarget.note = wasDraft ? newPromptNote() : customNote();
        persistPromptTarget();
        renderPromptChips();
        renderPromptSelect();
        renderPrompts();
        var note = $("prompt-note");
        if (note) {
          note.textContent = promptTarget.note;
          note.hidden = !promptTarget.note;
        }
        if ($("prompt-current")) $("prompt-current").textContent = "지금 대상 · " + promptDisplayName();
        updatePromptActions();
      });
    });
    renderPromptChips();
    renderPromptSelect();
    setPromptFieldValues();
    renderPrompts();
    renderJsonCard();
  }

  /* ---------- 단가·마진 계산기 ---------- */
  var KEY_PRODUCTS = "berainbow.products.v1";
  var calc = null;
  var products = [];
  var productSeq = 0;

  function calcDefaults() {
    var d = (DATA && DATA.calc && DATA.calc.defaults) || {};
    return {
      name: d.name || "",
      materials: Number(d.materials) || 0,
      packaging: Number(d.packaging) || 0,
      minutes: Number(d.minutes) || 0,
      hourly: Number(d.hourly) || 0,
      taxRate: Number(d.tax_rate) || 0,
      channel: d.channel || "coupang",
      sellerLink: false,
      price: Number(d.price) || 0,
      targetMargin: Number(d.target_margin) || 0
    };
  }

  function calcCost(item) {
    var labor = Math.round((Number(item.minutes) || 0) / 60 * (Number(item.hourly) || 0));
    return Math.round(Number(item.materials) || 0) + Math.round(Number(item.packaging) || 0) + labor;
  }

  function calcFeeRate(item) {
    var a = DATA.margin.assumptions;
    if (item.channel === "coupang") return a.coupang_fee;
    var rate = item.sellerLink ? a.naver_link_fee : a.naver_fee;
    return rate * (1 + a.vat) + a.npay;
  }

  function calcResult(item, price, share) {
    var a = DATA.margin.assumptions;
    var p = Number(price) || 0;
    var cost = calcCost(item);
    var feeRate = calcFeeRate(item);
    var fee = Math.round(p * feeRate);
    var logistics = item.channel === "coupang" ? a.coupang_logistics : 0;
    var tax = Math.round(p * (Number(item.taxRate) || 0) / 100);
    var net = p - fee - logistics - cost - tax;
    var margin = p ? net / p : 0;
    var mine = item.channel === "coupang" ? Math.round(net * share / 100) : net;
    return {
      price: p, cost: cost, labor: cost - Math.round(Number(item.materials) || 0) - Math.round(Number(item.packaging) || 0),
      fee: fee, feeRate: feeRate, logistics: logistics, tax: tax, net: net, margin: margin, mine: mine
    };
  }

  function roundUp(value, unit) {
    if (!isFinite(value) || value <= 0) return null;
    return Math.ceil(value / unit) * unit;
  }

  function suggestPrices(item) {
    var a = DATA.margin.assumptions;
    var cost = calcCost(item);
    var feeRate = calcFeeRate(item);
    var taxRate = (Number(item.taxRate) || 0) / 100;
    var fixed = item.channel === "coupang" ? a.coupang_logistics : 0;
    function solve(margin) {
      var den = 1 - feeRate - taxRate - margin;
      if (den <= 0.001) return null;
      return roundUp((cost + fixed) / den, 100);
    }
    var be = solve(0);
    var target = solve((Number(item.targetMargin) || 0) / 100);
    var mult = (DATA.calc && DATA.calc.premium_multiplier) || 1.3;
    var premium = target ? roundUp(target * mult, 1000) : null;
    return [
      { id: "be", step: "①", label: "손익분기 최소 판매가", price: be, note: "이 아래로 내려가면 팔수록 손해" },
      { id: "target", step: "②", label: "목표 마진율 기준 적정가", price: target, note: "목표 " + (Number(item.targetMargin) || 0) + "% 기준" },
      { id: "premium", step: "③", label: "프리미엄 추천가", price: premium, note: (DATA.calc && DATA.calc.premium_note) || "" }
    ];
  }

  function renderCalcPresets() {
    var root = $("calc-presets");
    if (!root || !DATA.calc) return;
    clear(root);
    (DATA.calc.product_presets || []).forEach(function (p) {
      var b = el("button", "preset-btn");
      b.type = "button";
      b.setAttribute("data-calc-preset", p.id);
      b.textContent = p.label;
      if (p.note) b.setAttribute("title", p.note);
      if (calc && calc.name === p.label) b.className = "preset-btn is-active";
      b.addEventListener("click", function () {
        calc.name = p.label;
        calc.materials = Number(p.materials) || 0;
        calc.packaging = Number(p.packaging) || 0;
        calc.minutes = Number(p.minutes) || 0;
        setCalcInputs();
        renderCalcPresets();
        renderCalc();
      });
      root.appendChild(b);
    });
  }

  function renderCalcChannels() {
    var root = $("calc-channels");
    if (!root || !DATA.calc) return;
    clear(root);
    (DATA.calc.channels || []).forEach(function (c) {
      var lab = el("label", "chan-option");
      lab.setAttribute("data-calc-channel", c.id);
      var input = document.createElement("input");
      input.type = "radio";
      input.name = "calc-channel";
      input.id = "calc-ch-" + c.id;
      input.value = c.id;
      input.checked = calc && calc.channel === c.id;
      lab.appendChild(input);
      var body = el("span", "chan-option-body");
      body.appendChild(el("span", "chan-option-label", c.label));
      body.appendChild(el("span", "chan-option-desc", c.desc));
      lab.appendChild(body);
      input.addEventListener("change", function () {
        if (!input.checked) return;
        calc.channel = c.id;
        syncSellerToggle();
        renderCalc();
      });
      root.appendChild(lab);
    });
  }

  function renderPriceQuick() {
    var root = $("calc-price-quick");
    if (!root || !DATA.calc) return;
    clear(root);
    (DATA.calc.price_options || []).forEach(function (v) {
      var b = el("button", "preset-btn");
      b.type = "button";
      b.setAttribute("data-price-option", String(v));
      b.textContent = num(v) + "원";
      if (calc && Number(calc.price) === v) b.className = "preset-btn is-active";
      b.addEventListener("click", function () {
        calc.price = v;
        var input = $("calc-price");
        if (input) input.value = String(v);
        renderPriceQuick();
        renderCalc();
      });
      root.appendChild(b);
    });
  }

  function syncSellerToggle() {
    var input = $("calc-seller-link");
    var wrap = $("calc-seller-wrap");
    var naver = calc && calc.channel === "naver";
    if (input) {
      input.disabled = !naver;
      input.checked = naver ? !!calc.sellerLink : false;
    }
    if (wrap) wrap.className = naver ? "switch" : "switch is-muted";
  }

  function renderCalc() {
    if (!DATA || !DATA.calc || !calc) return;
    var root = $("calc-results");
    if (!root) return;
    if ($("calc-lead")) $("calc-lead").textContent = DATA.calc.lead;
    if ($("calc-tax-note")) $("calc-tax-note").textContent = DATA.calc.tax_note;
    if ($("calc-save-note")) $("calc-save-note").textContent = DATA.calc.save_note;

    var share = sharePct();
    var r = calcResult(calc, calc.price, share);
    clear(root);

    function tile(id, label, value, sub, tone) {
      var card = el("div", "unit-tile unit-tile--" + (tone || "plain"));
      card.setAttribute("data-calc", id);
      card.appendChild(el("p", "unit-tile-label", label));
      card.appendChild(el("p", "unit-tile-value", value));
      if (sub) card.appendChild(el("p", "unit-tile-sub", sub));
      root.appendChild(card);
    }

    tile("cost", "총 제작원가", won(r.cost),
      "재료 " + num(calc.materials) + " + 포장 " + num(calc.packaging) + " + 인건비 " + num(r.labor) +
      " (" + num(calc.minutes) + "분 × " + num(calc.hourly) + "원/h)");
    tile("fee", "플랫폼 수수료 · 물류비", "−" + num(r.fee + r.logistics),
      "수수료 " + num(r.fee) + " (" + pct(r.feeRate) + ")" +
      (r.logistics ? " + 물류 " + num(r.logistics) : " · 물류 없음"), "warn");
    tile("tax", "예상 세금 (" + (Number(calc.taxRate) || 0) + "%)", "−" + num(r.tax),
      "판매가 " + won(r.price) + " 기준 예비치");
    tile("net", "최종 순마진 · 마진율", won(r.net) + " · " + pct(r.margin),
      r.net < 0 ? "이 가격으로는 손해입니다" : "판매가 " + won(r.price) + " 기준", r.net < 0 ? "warn" : "good");
    tile("mine", "내 실수령 정산액", won(r.mine),
      calc.channel === "coupang"
        ? "쿠팡은 은별 " + share + " : 공동 " + (100 - share) + " 배분 — 순이익의 " + share + "%"
        : "네이버 단독 채널 — 순이익 100%가 내 몫", "gold");

    var sug = $("calc-suggest");
    if (sug) {
      clear(sug);
      suggestPrices(calc).forEach(function (s) {
        var card = el("article", "suggest-card");
        card.setAttribute("data-suggest", s.id);
        card.appendChild(el("span", "suggest-step", s.step));
        card.appendChild(el("p", "suggest-label", s.label));
        card.appendChild(el("p", "suggest-price", s.price ? won(s.price) : "계산 불가"));
        card.appendChild(el("p", "suggest-note", s.price ? s.note : "목표 마진율이 수수료·세금 합보다 큽니다 — 목표를 낮춰 보세요."));
        sug.appendChild(card);
      });
    }
  }

  function setCalcInputs() {
    var map = [
      ["calc-name", calc.name],
      ["calc-materials", calc.materials],
      ["calc-packaging", calc.packaging],
      ["calc-minutes", calc.minutes],
      ["calc-hourly", calc.hourly],
      ["calc-tax", calc.taxRate],
      ["calc-price", calc.price],
      ["calc-target-margin", calc.targetMargin]
    ];
    map.forEach(function (pair) {
      var n = $(pair[0]);
      if (n && n.value !== String(pair[1])) n.value = String(pair[1]);
    });
    syncSellerToggle();
  }

  function normalizeProduct(item) {
    return {
      id: item.id || ("p" + Date.now() + "-" + (++productSeq)),
      name: item.name || "이름 없는 제품",
      materials: Number(item.materials) || 0,
      packaging: Number(item.packaging) || 0,
      minutes: Number(item.minutes) || 0,
      hourly: Number(item.hourly) || 0,
      taxRate: (item.taxRate !== undefined) ? Number(item.taxRate) || 0 : Number(item.tax_rate) || 0,
      channel: item.channel === "naver" ? "naver" : "coupang",
      sellerLink: (item.sellerLink !== undefined) ? !!item.sellerLink : !!item.seller_link,
      price: Number(item.price) || 0,
      targetMargin: (item.targetMargin !== undefined) ? Number(item.targetMargin) || 0 : Number(item.target_margin) || 0
    };
  }

  function loadProducts() {
    var saved = load(KEY_PRODUCTS, null);
    if (saved === null || saved === undefined) {
      var seed = (DATA.calc && DATA.calc.sample_product) ? [normalizeProduct(DATA.calc.sample_product)] : [];
      save(KEY_PRODUCTS, seed);
      return seed;
    }
    if (!saved || !saved.length) return [];
    return saved.map(normalizeProduct);
  }

  function productRow(item) {
    var r = calcResult(item, item.price, sharePct());
    var tr = document.createElement("tr");
    tr.setAttribute("data-product", item.id);
    tr.appendChild(el("td", "pname", item.name));
    tr.appendChild(el("td", "num", won(r.cost)));
    tr.appendChild(el("td", "chan chan--" + (item.channel === "coupang" ? "coupang" : "naver"),
      item.channel === "coupang" ? "쿠팡" : "네이버"));
    tr.appendChild(el("td", "num", won(r.price)));
    var netCell = el("td", "num net", won(r.net));
    if (r.net < 0) netCell.className = "num net is-negative";
    tr.appendChild(netCell);
    tr.appendChild(el("td", "num rate", pct(r.margin)));
    tr.appendChild(el("td", "num mine", won(r.mine)));
    var delCell = el("td");
    var del = el("button", "del-btn", "삭제");
    del.type = "button";
    del.setAttribute("data-delete", item.id);
    del.addEventListener("click", function () { deleteProduct(item.id); });
    delCell.appendChild(del);
    tr.appendChild(delCell);
    return tr;
  }

  function renderProducts() {
    var body = $("product-body");
    if (!body) return;
    clear(body);
    if ($("calc-count")) $("calc-count").textContent = products.length + "개";
    if (!products.length) {
      var tr = document.createElement("tr");
      var td = el("td", "empty-cell", DATA.calc.empty_note);
      td.setAttribute("colspan", "8");
      tr.appendChild(td);
      body.appendChild(tr);
      return;
    }
    products.forEach(function (item) { body.appendChild(productRow(item)); });
  }

  function saveProduct() {
    if (!calc) return;
    productSeq += 1;
    products.push(normalizeProduct({
      id: "p" + Date.now() + "-" + productSeq,
      name: (calc.name || "이름 없는 제품").slice(0, 40),
      materials: Number(calc.materials) || 0,
      packaging: Number(calc.packaging) || 0,
      minutes: Number(calc.minutes) || 0,
      hourly: Number(calc.hourly) || 0,
      taxRate: Number(calc.taxRate) || 0,
      channel: calc.channel,
      sellerLink: !!calc.sellerLink,
      price: Number(calc.price) || 0,
      targetMargin: Number(calc.targetMargin) || 0
    }));
    save(KEY_PRODUCTS, products);
    renderProducts();
    refreshPromptOptions();
    toast("제품 목록에 저장했어요 — 표에서 바로 비교됩니다.");
  }

  function deleteProduct(id) {
    products = products.filter(function (p) { return p.id !== id; });
    save(KEY_PRODUCTS, products);
    renderProducts();
    refreshPromptOptions();
    toast("목록에서 삭제했어요.");
  }

  function bindCalc() {
    if (!DATA || !DATA.calc) return;
    calc = calcDefaults();
    renderCalcPresets();
    renderCalcChannels();
    renderPriceQuick();
    setCalcInputs();

    var fields = [
      ["calc-name", "name", true],
      ["calc-materials", "materials"],
      ["calc-packaging", "packaging"],
      ["calc-minutes", "minutes"],
      ["calc-hourly", "hourly"],
      ["calc-tax", "taxRate"],
      ["calc-price", "price"],
      ["calc-target-margin", "targetMargin"]
    ];
    fields.forEach(function (f) {
      var n = $(f[0]);
      if (!n) return;
      n.addEventListener("input", function () {
        calc[f[1]] = f[2] ? n.value : (Number(n.value) || 0);
        if (f[1] === "name") renderCalcPresets();
        if (f[1] === "price") renderPriceQuick();
        renderCalc();
      });
    });

    var seller = $("calc-seller-link");
    if (seller) {
      seller.addEventListener("change", function () {
        calc.sellerLink = !!seller.checked;
        renderCalc();
      });
    }

    var saveBtn = $("calc-save");
    if (saveBtn) saveBtn.addEventListener("click", saveProduct);

    products = loadProducts();
    renderProducts();
    renderCalc();
  }

  /* ---------- 탭 ---------- */
  var TAB_IDS = ["today", "seo", "bench", "season", "gpt", "calc"];
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
    state.cost = (function () {
      var saved = load(KEY_COST, null);
      if (saved === null || saved === undefined || saved === "") {
        return (DATA.margin && DATA.margin.default_cost !== undefined) ? Number(DATA.margin.default_cost) : 0;
      }
      return Number(saved) || 0;
    })();
    var savedShare = load(KEY_SHARE, null);
    state.share = (savedShare === null || savedShare === undefined || savedShare === "")
      ? (DATA.share ? Number(DATA.share.default_pct) : 50)
      : Number(savedShare);
    var linkSaved = load(KEY_LINK, false);
    state.sellerLink = !!linkSaved;

    renderMeta();
    renderKpis();
    renderOps();
    renderStrategy();
    renderDiag();
    renderTasks();
    renderRisk();
    renderPricing();
    renderMargin();
    renderSeo();
    renderBench();
    renderSeasons();
    bindCalc();
    bindPrompts();
    bindTabs();
    setTab("today");

    var costInput = $("cost-input");
    if (costInput) {
      costInput.value = state.cost ? String(state.cost) : "";
      costInput.addEventListener("input", function () {
        state.cost = Number(costInput.value) || 0;
        save(KEY_COST, state.cost);
        renderMargin();
        renderCostPresets();
      });
    }
    renderCostPresets();
    var seller = $("seller-link");
    if (seller) {
      seller.checked = state.sellerLink;
      seller.addEventListener("change", function () {
        state.sellerLink = !!seller.checked;
        save(KEY_LINK, state.sellerLink);
        renderMargin();
      });
    }
    var shareInput = $("share-input");
    if (shareInput) {
      shareInput.value = String(sharePct());
      shareInput.addEventListener("input", function () { setShare(shareInput.value); });
      shareInput.addEventListener("change", function () { setShare(shareInput.value); });
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
    sharePct: sharePct,
    setShare: setShare,
    won: won,
    buildReelCopy: buildReelCopy,
    setTab: setTab,
    buildPrompt: buildPrompt,
    applyPromptItem: applyPromptItem,
    promptTarget: function () { return resolvePromptTarget(); },
    savedPromptItems: savedPromptItems,
    customPromptItems: customPromptItems,
    startNewPrompt: startNewPrompt,
    registerCustomProduct: registerCustomProduct,
    refreshPromptOptions: refreshPromptOptions
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
