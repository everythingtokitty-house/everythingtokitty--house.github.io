/* 캐릭터 콜라보 아카이브 — 렌더링 / 필터 / 검색 / 복사
   순수 바닐라 JS, 빌드 없음. 데이터는 ./data/collabs.json 을 fetch하고,
   file:// 로 열어 fetch가 막히면 data/collabs.js 의 window.__COLLABS__ 로 대체한다.
   모든 사용자 데이터는 textNode 로만 그린다(innerHTML 미사용). */
(function () {
  "use strict";

  var CHAR_META = {
    sanrio: { label: "산리오", sub: "키티중심", emoji: "🎀" },
    disney: { label: "디즈니", sub: "", emoji: "🏰" },
    pokemon: { label: "포켓몬", sub: "", emoji: "⚡" },
    miffy: { label: "미피", sub: "", emoji: "🐰" },
    shinchan: { label: "짱구", sub: "", emoji: "🍠" },
    monchhichi: { label: "몬치치", sub: "", emoji: "🐵" },
    rilakkuma: { label: "리락쿠마", sub: "", emoji: "🐻" },
    snoopy: { label: "스누피", sub: "", emoji: "🐶" }
  };
  var CHAR_ORDER = ["sanrio", "disney", "pokemon", "miffy", "shinchan", "monchhichi", "rilakkuma", "snoopy"];

  var ACCT_META = [
    { key: "all", label: "전체", emoji: "", sub: "" },
    { key: "방구석키티", label: "방구석키티", emoji: "🎀", sub: "" },
    { key: "애플트립", label: "애플트립", emoji: "✈️", sub: "팝업·방문" },
    { key: "캐릭터모음집", label: "캐릭터모음집", emoji: "🧩", sub: "" }
  ];

  var PERIOD_LABELS = {
    promotion: "프로모션", phase1: "1차", phase2: "2차", camp_mug: "캠프컵",
    start: "시작", end: "종료", open: "오픈", note: "참고",
    popup_gangnam: "강남 팝업", popup_busan: "부산 팝업",
    collab_start: "협업 시작", basket_reservation: "바구니 예약",
    waitlist: "위시리스트", release: "출시", presale: "사전예약", store: "매장",
    launch: "출시", app_reservation: "앱 예약", pickup: "픽업", store_sale: "매장 판매",
    event_end: "이벤트 종료", pouch_reservation: "파우치 예약", pouch_pickup: "파우치 수령",
    bag_reservation: "가방 예약", bag_sale: "가방 판매", grand_open: "그랜드 오픈",
    hanbok_first_sale: "한복 1차", first: "1차", second: "2차",
    jamsil: "잠실", seongsu: "성수", online: "온라인"
  };

  var URL_RE = /https?:\/\/[^\s<>"')\]]+/g;

  var els = {};
  var data = null;
  var items = [];
  var state = { char: "all", acct: "all", q: "" };
  var toastTimer = null;
  var lastCopied = "";

  /* ---------- helpers ---------- */
  function $(id) { return document.getElementById(id); }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function comma(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function won(n) { return comma(n) + "원"; }
  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function plain(s) { return String(s == null ? "" : s); }
  function firstKey(obj, skip) {
    for (var k in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
      if (skip && skip.indexOf(k) >= 0) continue;
      return k;
    }
    return null;
  }

  function charMeta(id) { return CHAR_META[id] || { label: "캐릭터", sub: "", emoji: "✨" }; }

  function terms() {
    return state.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  }

  /* ---------- text with search marks ---------- */
  function appendMarked(parent, text, tms) {
    if (!tms || !tms.length || !text) {
      parent.appendChild(document.createTextNode(plain(text)));
      return;
    }
    var sorted = tms.slice().sort(function (a, b) { return b.length - a.length; });
    var re = new RegExp("(" + sorted.map(escapeRe).join("|") + ")", "gi");
    var parts = String(text).split(re);
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

  /* ---------- status ---------- */
  function normalizeStatus(raw) {
    var s = plain(raw);
    if (/종료/.test(s) && /까지|예정/.test(s)) return { label: "일부 종료", cls: "badge--ended" };
    if (/종료/.test(s)) return { label: "종료", cls: "badge--ended" };
    if (/예정/.test(s)) return { label: "예정", cls: "badge--soon" };
    if (/상시/.test(s)) return { label: "상시", cls: "badge--always" };
    if (/판매중|진행중|재고/.test(s)) return { label: "진행중", cls: "" };
    return { label: s || "정보 없음", cls: "" };
  }

  /* ---------- flatten & index ---------- */
  function flatten(source) {
    var out = [];
    (source.characters || []).forEach(function (c) {
      var meta = charMeta(c.id);
      (c.items || []).forEach(function (raw) {
        var item = {};
        for (var k in raw) {
          if (Object.prototype.hasOwnProperty.call(raw, k)) item[k] = raw[k];
        }
        item.charId = c.id;
        item.charName = c.name_ko;
        item.charLabel = meta.label;
        item.charEmoji = meta.emoji;
        item.hay = haystack(item);
        out.push(item);
      });
    });
    return out;
  }

  function haystack(item) {
    var parts = [item.collab_name, item.brand, item.status, item.charLabel, item.charName];
    parts.push((item.sales_channels || []).join(" "));
    parts.push((item.lineup || []).join(" "));
    parts.push((item.features || []).join(" "));
    (item.prices || []).forEach(function (p) { parts.push(p.item, p.note, p.krw, p.sale_krw); });
    var o = item.offline || {};
    parts.push(o.venue, o.address, o.hours, o.reservation, o.period);
    (item.sources || []).forEach(function (s) { parts.push(s); });
    var c = item.carousel || {};
    parts.push(c.cover_headline, (c.body_points || []).join(" "));
    (item.official_urls || []).forEach(function (u) { parts.push(u); });
    var p = item.period || {};
    for (var k in p) {
      if (Object.prototype.hasOwnProperty.call(p, k)) parts.push(p[k]);
    }
    return parts.filter(Boolean).join(" \n ").toLowerCase();
  }

  function matchItem(item, charKey, acctKey, tms) {
    if (charKey !== "all" && item.charId !== charKey) return false;
    if (acctKey !== "all" && (item.recommended_accounts || []).indexOf(acctKey) < 0) return false;
    for (var i = 0; i < tms.length; i++) {
      if (item.hay.indexOf(tms[i]) < 0) return false;
    }
    return true;
  }

  function filterItems(charKey, acctKey, q) {
    var tms = String(q || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
    return items.filter(function (item) { return matchItem(item, charKey, acctKey, tms); });
  }

  /* ---------- summary helpers ---------- */
  function periodSummary(item) {
    var p = item.period || {};
    if (p.promotion) return p.promotion;
    if (p.start && p.end) return p.start + " ~ " + p.end;
    var k = firstKey(p, ["note"]);
    return k ? p[k] : "일정 미확인";
  }

  function priceSummary(item) {
    var ps = item.prices || [];
    var priced = ps.filter(function (p) { return typeof p.krw === "number"; });
    if (!priced.length) return "가격 미확인";
    var low = null, high = null;
    priced.forEach(function (p) {
      var v = typeof p.sale_krw === "number" ? p.sale_krw : p.krw;
      if (low === null || v < low) low = v;
      if (high === null || v > high) high = v;
    });
    if (low === high) return won(low);
    return won(low) + " ~ " + won(high);
  }

  function priceLines(item) {
    return (item.prices || []).map(function (p) {
      var txt = p.item;
      if (typeof p.sale_krw === "number" && typeof p.krw === "number") {
        txt += " " + comma(p.sale_krw) + "원(정가 " + comma(p.krw) + "원)";
      } else if (typeof p.krw === "number") {
        txt += " " + comma(p.krw) + "원";
      } else {
        txt += " → " + (p.note || "미확인");
      }
      if (p.note && typeof p.krw === "number") txt += " (" + p.note + ")";
      return "- " + txt;
    });
  }

  /* ---------- copy text (캔바 캐러셀 + 블로그) ---------- */
  function buildCopyText(item) {
    var ch = charMeta(item.charId);
    var c = item.carousel || {};
    var o = item.offline || {};
    var L = [];
    var label = ch.sub ? ch.label + "(" + ch.sub + ")" : ch.label;

    L.push("[캔바 캐러셀 · 표지]");
    L.push("· 뱃지: CHARACTER NEWS");
    L.push("· 메인 헤드: " + (c.cover_headline || item.collab_name));
    L.push("· 서브 헤드: " + item.brand + " × " + label + " · " + periodSummary(item));
    L.push("· 라인업: " + ((item.lineup || []).join(", ") || "미확인"));
    L.push("");
    L.push("[내지 1 · 제목]");
    L.push(item.collab_name);
    L.push("· 브랜드: " + item.brand);
    L.push("· 상태: " + plain(item.status));
    L.push("· 판매처: " + ((item.sales_channels || []).join(", ") || "미확인"));
    L.push("");
    L.push("[내지 2 · 금액]");
    var pl = priceLines(item);
    if (pl.length) {
      pl.forEach(function (line) { L.push(line); });
    } else {
      L.push("- 가격 미확인");
    }
    L.push("");
    L.push("[내지 3 · 구성·특징]");
    (item.features || []).forEach(function (f) { L.push("- " + f); });
    if ((item.lineup || []).length) L.push("· 구성: " + item.lineup.join(", "));
    L.push("");
    L.push("[방문 정보]");
    if (o.visitable) {
      L.push("- 장소: " + plain(o.venue));
      L.push("- 주소: " + plain(o.address));
      L.push("- 기간: " + plain(o.period));
      L.push("- 운영시간: " + plain(o.hours));
      L.push("- 예약: " + plain(o.reservation));
    } else {
      L.push("- 오프라인 방문 없음(온라인 판매)");
      if (o.venue) L.push("- 참고: " + o.venue);
    }
    L.push("");
    L.push("[공식 링크]");
    (item.official_urls || []).forEach(function (u) { L.push("- " + u); });
    L.push("");
    L.push("[출처]");
    (item.sources || []).forEach(function (s) { L.push("- " + s); });
    if ((c.body_points || []).length) {
      L.push("");
      L.push("[캐러셀 내지 요약]");
      (c.body_points || []).forEach(function (b) { L.push("- " + b); });
    }
    L.push("");
    L.push("추천 계정: " + (item.recommended_accounts || []).map(function (a) {
      var meta = ACCT_META.filter(function (m) { return m.key === a; })[0];
      return meta ? meta.emoji + " " + a : a;
    }).join(" · "));
    L.push("기준일 " + (data && data.meta ? data.meta.as_of : "") + " · 캐릭터 콜라보 아카이브");
    return L.join("\n");
  }

  /* ---------- clipboard ---------- */
  function legacyCopy(text) {
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "readonly");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand ? document.execCommand("copy") : false;
      document.body.removeChild(ta);
      return !!ok;
    } catch (e) {
      return false;
    }
  }

  function showToast(msg, isError) {
    var t = els.toast;
    if (!t) return;
    t.textContent = msg;
    t.hidden = false;
    t.className = "toast is-on" + (isError ? " is-error" : "");
    if (toastTimer && window.clearTimeout) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      t.className = "toast";
      t.hidden = true;
    }, 2400);
  }

  function copyItem(item, btn) {
    var text = buildCopyText(item);
    lastCopied = text;
    var finish = function (ok) {
      if (ok) {
        showToast("📋 '" + item.collab_name.slice(0, 22) + (item.collab_name.length > 22 ? "…" : "") +
          "' 캔바·블로그용 텍스트를 복사했어요", false);
        if (btn) {
          btn.className = "copy-btn is-done";
          btn.textContent = "✓ 복사됨";
        }
      } else {
        showToast("복사가 막혔어요. 아래 '캐러셀 미리보기'에서 직접 선택해 복사해 주세요.", true);
      }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        navigator.clipboard.writeText(text).then(function () { finish(true); }, function () {
          finish(legacyCopy(text));
        });
      } catch (e) {
        finish(legacyCopy(text));
      }
    } else {
      finish(legacyCopy(text));
    }
    return text;
  }

  /* ---------- render: header bits ---------- */
  function renderMeta() {
    var meta = data.meta || {};
    var summary = data.summary || {};
    if (els.asof) els.asof.textContent = "기준일 " + (meta.as_of || "—");
    if (els.autoMeta) {
      els.autoMeta.textContent = "총 " + items.length + "건 · " + (data.characters || []).length + "캐릭터 · JSON";
    }
    if (els.jsonLink) els.jsonLink.setAttribute("href", "./data/collabs.json");
    if (els.footerMeta) {
      var cov = summary.image_url_coverage || {};
      els.footerMeta.textContent = "총 " + items.length + "건 · " + (data.characters || []).length +
        "캐릭터 · 방문형 " + (summary.visitable_items || []).length + "건 · 제품 사진 " +
        (cov.confirmed || 0) + "/" + (cov.total || items.length) + " · 기준일 " + (meta.as_of || "—");
    }
  }

  function renderCalendar() {
    var list = data.summary && data.summary.upcoming_december;
    if (!list || !list.length || !els.calBar) return;
    els.calBar.hidden = false;
    els.calList.replaceChildren();
    list.forEach(function (entry) {
      var date = plain(entry.date);
      var md = date.slice(5).replace("-", "/");
      var target = null;
      items.forEach(function (item) {
        if (target) return;
        var p = item.period || {};
        for (var k in p) {
          if (Object.prototype.hasOwnProperty.call(p, k) && String(p[k]).indexOf(date) >= 0) {
            target = item;
            break;
          }
        }
      });
      var node = el(target ? "button" : "div", "cal-item");
      if (target) {
        node.setAttribute("type", "button");
        node.setAttribute("data-goto", target.id);
      }
      var d = el("span", "cal-date", md);
      var txt = el("span", "cal-text", plain(entry.item));
      node.appendChild(d);
      node.appendChild(txt);
      if (target) {
        node.appendChild(el("span", "cal-link-dot", "›"));
        node.addEventListener("click", function () {
          state.char = "all";
          state.acct = "all";
          state.q = "";
          if (els.search) els.search.value = "";
          render();
          var card = document.getElementById("card-" + target.id);
          if (card && card.scrollIntoView) card.scrollIntoView({ behavior: "smooth", block: "start" });
          if (card) card.setAttribute("data-focus", "1");
        });
      } else {
        node.setAttribute("data-goto", "");
      }
      els.calList.appendChild(node);
    });
  }

  /* ---------- render: filters ---------- */
  function renderTabs(tms) {
    if (!els.tabs) return;
    els.tabs.replaceChildren();
    var allBtn = el("button", "tab");
    allBtn.setAttribute("type", "button");
    allBtn.setAttribute("data-char", "all");
    allBtn.setAttribute("aria-pressed", state.char === "all" ? "true" : "false");
    allBtn.appendChild(el("span", null, "전체"));
    var allCount = items.filter(function (it) { return matchItem(it, "all", state.acct, tms); }).length;
    allBtn.appendChild(el("span", "count", "(" + allCount + ")"));
    allBtn.addEventListener("click", function () { state.char = "all"; render(); });
    els.tabs.appendChild(allBtn);

    var present = {};
    items.forEach(function (it) { present[it.charId] = true; });
    var order = CHAR_ORDER.filter(function (k) { return present[k]; });
    Object.keys(present).forEach(function (k) { if (order.indexOf(k) < 0) order.push(k); });

    order.forEach(function (key) {
      var meta = charMeta(key);
      var n = items.filter(function (it) { return matchItem(it, key, state.acct, tms); }).length;
      var btn = el("button", "tab ch-" + key);
      btn.setAttribute("type", "button");
      btn.setAttribute("data-char", key);
      btn.setAttribute("aria-pressed", state.char === key ? "true" : "false");
      if (!n) btn.className += " is-empty";
      btn.appendChild(el("span", "emoji", meta.emoji));
      btn.appendChild(el("span", "tab-label", meta.sub ? meta.label + "(" + meta.sub + ")" : meta.label));
      btn.appendChild(el("span", "count", "(" + n + ")"));
      btn.addEventListener("click", function () { state.char = key; render(); });
      els.tabs.appendChild(btn);
    });
  }

  function renderAccounts(tms) {
    if (!els.accounts) return;
    els.accounts.replaceChildren();
    ACCT_META.forEach(function (meta) {
      var n = meta.key === "all"
        ? items.filter(function (it) { return matchItem(it, state.char, "all", tms); }).length
        : items.filter(function (it) { return matchItem(it, state.char, meta.key, tms); }).length;
      var btn = el("button", "acct");
      btn.setAttribute("type", "button");
      btn.setAttribute("data-acct", meta.key);
      btn.setAttribute("aria-pressed", state.acct === meta.key ? "true" : "false");
      if (meta.emoji) btn.appendChild(el("span", "emoji", meta.emoji));
      btn.appendChild(el("span", null, meta.sub ? meta.label + "(" + meta.sub + ")" : meta.label));
      btn.appendChild(el("span", "count", "(" + n + ")"));
      btn.addEventListener("click", function () { state.acct = meta.key; render(); });
      els.accounts.appendChild(btn);
    });
  }

  /* ---------- render: card ---------- */
  function mediaBlock(item) {
    var media = el("div", "card-media");
    var urls = item.image_urls || [];
    var fb = el("div", "media-fallback");
    fb.appendChild(el("span", "media-fallback-emoji", item.charEmoji));
    fb.appendChild(el("span", "media-fallback-char", item.charLabel + " 콜라보"));
    var fbNote = el("span", "media-fallback-note", urls.length ? "사진 불러오는 중" : "공식 사진 미확보");
    fb.appendChild(fbNote);
    media.appendChild(fb);
    if (urls.length) {
      var img = document.createElement("img");
      img.setAttribute("alt", item.collab_name + " 제품 사진");
      img.setAttribute("loading", "lazy");
      img.setAttribute("decoding", "async");
      img.setAttribute("referrerpolicy", "no-referrer");
      img.addEventListener("error", function () {
        if (img.parentNode) img.parentNode.removeChild(img);
        fbNote.textContent = "이미지 차단 · 대체 표시";
      });
      img.setAttribute("src", urls[0]);
      media.appendChild(img);
    }
    var flag = el("span", "card-flag" + ((item.offline || {}).visitable ? " card-flag--visit" : ""),
      (item.offline || {}).visitable ? "🗺 방문형" : "💻 온라인");
    media.appendChild(flag);
    return media;
  }

  function row(label, bodyBuilder) {
    var r = el("div", "row");
    r.appendChild(el("div", "row-label", label));
    var b = el("div", "row-body");
    bodyBuilder(b);
    r.appendChild(b);
    return r;
  }

  function datesBody(item, tms) {
    var p = item.period || {};
    var wrap = el("div", "dates");
    var any = false;
    Object.keys(p).forEach(function (key) {
      if (key === "note") return;
      var val = plain(p[key]);
      if (!val) return;
      any = true;
      var line = el("div", "date-line");
      line.appendChild(el("span", "date-key", PERIOD_LABELS[key] || key));
      var v = el("span", "date-val");
      appendMarked(v, val, tms);
      line.appendChild(v);
      wrap.appendChild(line);
    });
    if (!any) wrap.appendChild(el("div", "date-val", "일정 미확인"));
    var st = normalizeStatus(item.status);
    if (plain(item.status) && plain(item.status) !== st.label) {
      wrap.appendChild(el("div", "date-note", "상태: " + plain(item.status)));
    }
    if (p.note) {
      var note = el("div", "date-note");
      appendMarked(note, plain(p.note), tms);
      wrap.appendChild(note);
    }
    return wrap;
  }

  function pricesBody(item, tms) {
    var list = el("ul", "prices");
    var ps = item.prices || [];
    if (!ps.length) {
      list.appendChild(el("li", "price-note", "가격 미확인"));
      return list;
    }
    ps.forEach(function (p) {
      var li = el("li");
      var name = el("span", "price-name");
      appendMarked(name, plain(p.item), tms);
      li.appendChild(name);
      if (typeof p.krw === "number" || typeof p.sale_krw === "number") {
        if (typeof p.sale_krw === "number" && typeof p.krw === "number") {
          li.appendChild(el("span", "price-was", won(p.krw)));
          li.appendChild(el("span", "price-sale", won(p.sale_krw)));
        } else {
          li.appendChild(el("span", "price-val", won(typeof p.krw === "number" ? p.krw : p.sale_krw)));
        }
      } else {
        li.appendChild(el("span", "price-val is-unknown", "미확인"));
      }
      list.appendChild(li);
      if (p.note) {
        var n = el("li", "price-note");
        appendMarked(n, "· " + plain(p.note), tms);
        list.appendChild(n);
      }
    });
    return list;
  }

  function featuresBody(item, tms) {
    var wrap = el("div");
    var ul = el("ul", "feats");
    (item.features || []).forEach(function (f) {
      var li = el("li");
      appendMarked(li, plain(f), tms);
      ul.appendChild(li);
    });
    wrap.appendChild(ul);
    if ((item.lineup || []).length) {
      var chips = el("div", "lineup");
      item.lineup.forEach(function (l) {
        var c = el("span", "lineup-chip");
        appendMarked(c, plain(l), tms);
        chips.appendChild(c);
      });
      wrap.appendChild(chips);
    }
    return wrap;
  }

  function visitBody(item, tms) {
    var o = item.offline || {};
    var box = el("div", "visit" + (o.visitable ? "" : " visit--none"));
    if (!o.visitable) {
      var l = el("div", "visit-line");
      l.appendChild(el("span", "visit-key", "안내"));
      var v = el("span", "visit-val");
      appendMarked(v, "오프라인 방문 없음 — 온라인 판매" + (o.venue ? " (" + o.venue + ")" : ""), tms);
      l.appendChild(v);
      box.appendChild(l);
      return box;
    }
    [
      ["장소", o.venue], ["주소", o.address], ["기간", o.period],
      ["운영", o.hours], ["예약", o.reservation]
    ].forEach(function (pair) {
      var val = plain(pair[1]);
      if (!val) return;
      var line = el("div", "visit-line");
      line.appendChild(el("span", "visit-key", pair[0]));
      var span = el("span", "visit-val");
      appendMarked(span, val, tms);
      line.appendChild(span);
      box.appendChild(line);
    });
    return box;
  }

  function linksBody(item) {
    var wrap = el("div", "links");
    (item.official_urls || []).forEach(function (url) {
      var a = el("a", "link-chip");
      a.setAttribute("href", url);
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener noreferrer");
      a.appendChild(el("span", "dot"));
      var label = plain(url).replace(/^https?:\/\//, "").replace(/\/$/, "");
      var span = el("span", "url", label.length > 34 ? label.slice(0, 34) + "…" : label);
      a.appendChild(span);
      a.setAttribute("title", url);
      wrap.appendChild(a);
    });
    return wrap;
  }

  function sourcesBlock(item) {
    var d = document.createElement("details");
    d.className = "sources";
    var sum = document.createElement("summary");
    sum.textContent = "출처·검증 (" + (item.sources || []).length + ")";
    d.appendChild(sum);
    var body = el("div", "sources-body");
    (item.sources || []).forEach(function (s) {
      body.appendChild(el("div", "source-line", plain(s)));
    });
    if (item.verification_note) {
      body.appendChild(el("p", "source-note", "검증: " + item.verification_note));
    }
    d.appendChild(body);
    return d;
  }

  function card(item, tms) {
    var art = el("article", "card ch-" + item.charId);
    art.setAttribute("id", "card-" + item.id);
    art.setAttribute("data-id", item.id);
    art.setAttribute("data-char", item.charId);

    art.appendChild(mediaBlock(item));

    var body = el("div", "card-body");

    var badges = el("div", "badges");
    var st = normalizeStatus(item.status);
    var sb = el("span", "badge" + (st.cls ? " " + st.cls : ""), st.label);
    badges.appendChild(sb);
    badges.appendChild(el("span", "badge badge--char", item.charEmoji + " " + item.charLabel));
    (item.recommended_accounts || []).forEach(function (a) {
      var meta = ACCT_META.filter(function (m) { return m.key === a; })[0];
      badges.appendChild(el("span", "badge badge--acct", (meta ? meta.emoji + " " : "") + a));
    });
    body.appendChild(badges);

    var title = el("h2", "card-title");
    appendMarked(title, plain(item.collab_name), tms);
    body.appendChild(title);

    var brand = el("p", "card-brand");
    appendMarked(brand, plain(item.brand), tms);
    brand.appendChild(document.createTextNode(" · " + periodSummary(item)));
    body.appendChild(brand);

    var kv = el("div", "kv");
    kv.appendChild(row("일정", function (b) { b.appendChild(datesBody(item, tms)); }));
    kv.appendChild(row("판매처", function (b) {
      appendMarked(b, (item.sales_channels || []).join(" · ") || "미확인", tms);
    }));
    kv.appendChild(row("금액", function (b) { b.appendChild(pricesBody(item, tms)); }));
    kv.appendChild(row("구성·특징", function (b) { b.appendChild(featuresBody(item, tms)); }));
    kv.appendChild(row("방문 정보", function (b) { b.appendChild(visitBody(item, tms)); }));
    kv.appendChild(row("공식 링크", function (b) { b.appendChild(linksBody(item)); }));
    body.appendChild(kv);

    var car = item.carousel || {};
    if (car.cover_headline) {
      var head = el("div", "carousel-head");
      head.appendChild(el("b", null, "캔바 표지 헤드: "));
      head.appendChild(document.createTextNode(car.cover_headline));
      body.appendChild(head);
    }

    var actions = el("div", "actions");
    var btn = el("button", "copy-btn");
    btn.setAttribute("type", "button");
    btn.setAttribute("data-copy", item.id);
    btn.textContent = "📋 캔바/블로그용 복사";
    btn.addEventListener("click", function () { copyItem(item, btn); });
    actions.appendChild(btn);
    body.appendChild(actions);

    body.appendChild(sourcesBlock(item));

    art.appendChild(body);
    return art;
  }

  /* ---------- render: main ---------- */
  function render() {
    var tms = terms();
    renderTabs(tms);
    renderAccounts(tms);

    var shown = filterItems(state.char, state.acct, state.q);
    if (els.results) els.results.replaceChildren();

    var counts = { 진행중: 0, 예정: 0, 종료: 0, 상시: 0 };
    shown.forEach(function (it) {
      var s = normalizeStatus(it.status).label;
      if (s === "일부 종료") s = "종료";
      if (counts[s] != null) counts[s] += 1;
    });

    if (els.status) {
      var parts = [];
      if (counts["진행중"]) parts.push("진행중 " + counts["진행중"]);
      if (counts["예정"]) parts.push("예정 " + counts["예정"]);
      if (counts["상시"]) parts.push("상시 " + counts["상시"]);
      if (counts["종료"]) parts.push("종료 " + counts["종료"]);
      if (state.char !== "all") {
        parts.push(charMeta(state.char).label + "만");
      }
      if (state.acct !== "all") parts.push(state.acct + " 추천만");
      if (state.q.trim()) parts.push("'" + state.q.trim() + "' 검색");
      els.status.replaceChildren();
      var strong = el("strong", null, shown.length + "건");
      els.status.appendChild(strong);
      els.status.appendChild(document.createTextNode(
        " 표시 / 전체 " + items.length + "건" + (parts.length ? " · " + parts.join(" · ") : "")));
    }

    if (!shown.length) {
      var empty = el("div", "empty");
      empty.appendChild(el("span", "empty-emoji", "🔍"));
      empty.appendChild(el("p", "empty-title", "조건에 맞는 콜라보가 없어요"));
      empty.appendChild(el("p", "empty-body", "검색어를 줄이거나 캐릭터·계정 필터를 '전체'로 바꿔 보세요."));
      var reset = el("button", null, "필터 초기화");
      reset.setAttribute("type", "button");
      reset.addEventListener("click", function () {
        state.char = "all";
        state.acct = "all";
        state.q = "";
        if (els.search) els.search.value = "";
        if (els.searchClear) els.searchClear.hidden = true;
        render();
      });
      empty.appendChild(reset);
      if (els.results) els.results.appendChild(empty);
      return;
    }

    var cards = el("div", "cards");
    shown.forEach(function (item) { cards.appendChild(card(item, tms)); });
    if (els.results) els.results.appendChild(cards);
  }

  /* ---------- boot ---------- */
  function bind() {
    els.search = $("search-input");
    els.searchClear = $("search-clear");
    els.tabs = $("tabs");
    els.accounts = $("accounts");
    els.results = $("results");
    els.status = $("status");
    els.asof = $("asof");
    els.autoMeta = $("auto-meta");
    els.jsonLink = $("json-link");
    els.footerMeta = $("footer-meta");
    els.toast = $("toast");
    els.calBar = $("cal-bar");
    els.calList = $("cal-list");
    els.filterBar = $("filter-bar");

    if (els.search) {
      els.search.addEventListener("input", function () {
        state.q = els.search.value || "";
        if (els.searchClear) els.searchClear.hidden = !state.q;
        render();
      });
      els.search.addEventListener("search", function () {
        state.q = els.search.value || "";
        if (els.searchClear) els.searchClear.hidden = !state.q;
        render();
      });
    }
    if (els.searchClear) {
      els.searchClear.addEventListener("click", function () {
        state.q = "";
        if (els.search) {
          els.search.value = "";
          if (els.search.focus) els.search.focus();
        }
        els.searchClear.hidden = true;
        render();
      });
    }
    if (window.addEventListener) {
      window.addEventListener("scroll", function () {
        if (!els.filterBar || !els.filterBar.getBoundingClientRect) return;
        var top = els.filterBar.getBoundingClientRect().top;
        var cls = els.filterBar.className.replace(" is-stuck", "");
        els.filterBar.className = top <= 1 ? cls + " is-stuck" : cls;
      }, { passive: true });
    }
  }

  function boot(source) {
    data = source || {};
    items = flatten(data);
    renderMeta();
    renderCalendar();
    render();
  }

  function showError(err) {
    if (els.status) els.status.textContent = "";
    var box = el("div", "error");
    box.appendChild(el("strong", null, "콜라보 데이터를 불러오지 못했어요. "));
    box.appendChild(document.createTextNode(
      "data/collabs.json 을 읽는 중 문제가 생겼습니다(" + (err && err.message ? err.message : "알 수 없는 오류") +
      "). GitHub Pages 주소로 다시 열거나, JSON 을 직접 확인해 주세요: "));
    var a = el("a", null, "collabs.json");
    a.setAttribute("href", "./data/collabs.json");
    box.appendChild(a);
    if (els.results) els.results.replaceChildren(box);
  }

  function start() {
    bind();
    if (window.__COLLABS__) {
      boot(window.__COLLABS__);
      return;
    }
    if (typeof fetch !== "function") {
      boot({ meta: {}, characters: [], summary: {} });
      return;
    }
    fetch("./data/collabs.json", { cache: "no-cache" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(boot)
      .catch(showError);
  }

  window.__CHARACTERS_BRIEF__ = {
    getState: function () { return state; },
    getData: function () { return data; },
    getItems: function () { return items; },
    filter: filterItems,
    buildCopyText: buildCopyText,
    normalizeStatus: normalizeStatus,
    getLastCopied: function () { return lastCopied; },
    open: function (charKey) { state.char = charKey; render(); }
  };

  if (document.readyState === "loading" && document.addEventListener) {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
