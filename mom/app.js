/* 🥐 엄마의 제과기능사 — 필기 모의고사 앱
   순수 HTML/CSS/JS. 데이터는 data/questions.js(번들) 우선, 없으면 data/questions.json fetch. */
(function () {
  "use strict";

  var LS_KEY = "momBakery.v3";
  var SUBJECTS = ["제과이론", "재료과학", "영양학", "식품위생학"];
  var CIRCLE = ["①", "②", "③", "④"];
  var PRACTICE_PAGE = 20;

  var DATA = null;
  var QMAP = {};
  var state = null;
  var ui = { tab: "exam", practiceKind: "subject", practiceValue: "all", practiceLimit: PRACTICE_PAGE, reveal: {}, scroll: false };

  /* ── 유틸 ─────────────────────────────── */
  function later(fn, ms) {
    if (typeof setTimeout === "function") return setTimeout(fn, ms);
    fn();
  }
  function byId(id) { return document.getElementById(id); }
  function clear(node) {
    if (node.replaceChildren) node.replaceChildren();
    else while (node.firstChild) node.removeChild(node.firstChild);
  }
  function h(tag, opts, kids) {
    var n = document.createElement(tag);
    opts = opts || {};
    if (opts.class) n.className = opts.class;
    if (opts.type) n.setAttribute("type", String(opts.type));
    if (opts.text != null) n.textContent = String(opts.text);
    if (opts.attrs) {
      for (var k in opts.attrs) {
        if (Object.prototype.hasOwnProperty.call(opts.attrs, k) && opts.attrs[k] != null) {
          n.setAttribute(k, String(opts.attrs[k]));
        }
      }
    }
    if (opts.on) {
      for (var e in opts.on) {
        if (Object.prototype.hasOwnProperty.call(opts.on, e)) n.addEventListener(e, opts.on[e]);
      }
    }
    if (kids != null) {
      (Array.isArray(kids) ? kids : [kids]).forEach(function (c) {
        if (c == null || c === false) return;
        n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
      });
    }
    return n;
  }
  function confirmBox(msg) {
    if (typeof window.confirm === "function") return window.confirm(msg);
    return true;
  }
  function scrollTop() {
    if (typeof window.scrollTo === "function") window.scrollTo(0, 0);
  }
  function scrollToNode(node) {
    if (node && typeof node.scrollIntoView === "function") {
      try { node.scrollIntoView({ block: "start" }); } catch (e) { node.scrollIntoView(); }
    }
  }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* ── 상태 저장 ────────────────────────── */
  function examKeys() {
    var keys = [];
    if (DATA && DATA.mockExams) {
      DATA.mockExams.forEach(function (m) { keys.push(String(m.id)); });
    }
    if (!keys.length) keys = ["1", "2", "3"];
    return keys.concat(["random", "retry"]);
  }
  function emptyMap(keys) {
    var o = {};
    keys.forEach(function (k) { o[k] = {}; });
    return o;
  }
  function zeroMap(keys) {
    var o = {};
    keys.forEach(function (k) { o[k] = 0; });
    return o;
  }
  function defaultState() {
    var keys = examKeys();
    return {
      v: 3,
      tab: "exam",
      instant: false,
      examId: "1",
      answers: emptyMap(keys),
      index: zeroMap(keys),
      graded: {},
      wrong: {},
      randomIds: null,
      retryIds: null,
      updatedAt: null
    };
  }
  function loadState() {
    var s = defaultState();
    try {
      var raw = window.localStorage ? window.localStorage.getItem(LS_KEY) : null;
      if (raw) {
        var got = JSON.parse(raw);
        if (got && typeof got === "object") {
          s.instant = !!got.instant;
          s.tab = got.tab || "exam";
          s.examId = got.examId || "1";
          s.answers = got.answers && typeof got.answers === "object" ? got.answers : s.answers;
          s.index = got.index && typeof got.index === "object" ? got.index : s.index;
          s.graded = got.graded && typeof got.graded === "object" ? got.graded : {};
          s.wrong = got.wrong && typeof got.wrong === "object" ? got.wrong : {};
          s.randomIds = Array.isArray(got.randomIds) ? got.randomIds : null;
          s.retryIds = Array.isArray(got.retryIds) ? got.retryIds : null;
        }
      }
    } catch (e) { /* 저장값이 깨져도 새로 시작 */ }
    ["random", "retry"].concat(examKeys()).forEach(function (k) {
      if (!s.answers[k] || typeof s.answers[k] !== "object") s.answers[k] = {};
      if (typeof s.index[k] !== "number") s.index[k] = 0;
    });
    if (examKeys().indexOf(s.examId) < 0) s.examId = "1";
    if (["exam", "practice", "summary"].indexOf(s.tab) < 0) s.tab = "exam";
    return s;
  }
  function save() {
    try {
      state.updatedAt = new Date().toISOString();
      if (window.localStorage) window.localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch (e) { /* 저장 실패는 조용히 넘어간다 */ }
  }

  /* ── 시험 구성 ────────────────────────── */
  function mockMeta(id) {
    for (var i = 0; i < DATA.mockExams.length; i++) {
      if (String(DATA.mockExams[i].id) === String(id)) return DATA.mockExams[i];
    }
    return null;
  }
  function idsOf(examId) {
    if (examId === "random") return state.randomIds && state.randomIds.length ? state.randomIds.slice() : [];
    if (examId === "retry") return state.retryIds && state.retryIds.length ? state.retryIds.slice() : [];
    var m = mockMeta(examId);
    return m ? m.questionIds.slice() : [];
  }
  function titleOf(examId) {
    if (examId === "random") return "랜덤 60문제";
    if (examId === "retry") return "틀린 문제 다시 풀기";
    var m = mockMeta(examId);
    return m ? "제" + m.id + "회 모의고사" : "모의고사";
  }
  function buildRandomIds() {
    var comp = (DATA.examInfo && DATA.examInfo.setComposition) || {};
    var out = [];
    SUBJECTS.forEach(function (s) {
      var pool = DATA.questions.filter(function (q) { return q.subject === s; }).map(function (q) { return q.id; });
      shuffle(pool);
      out = out.concat(pool.slice(0, comp[s] || 0));
    });
    if (out.length !== 60) {
      var rest = DATA.questions.map(function (q) { return q.id; }).filter(function (id) { return out.indexOf(id) < 0; });
      shuffle(rest);
      out = out.concat(rest.slice(0, Math.max(0, 60 - out.length)));
    }
    return shuffle(out);
  }
  function answersOf(examId) { return state.answers[examId] || (state.answers[examId] = {}); }
  function solvedCount(examId) {
    var ids = idsOf(examId), ans = answersOf(examId), n = 0;
    ids.forEach(function (id) { if (ans[id] != null) n++; });
    return n;
  }

  /* ── 오답노트 ─────────────────────────── */
  function noteWrong(qid, chosen) {
    state.wrong[qid] = {
      chosen: chosen == null ? null : chosen,
      at: new Date().toISOString().slice(0, 10)
    };
  }
  function forgetWrong(qid) {
    if (state.wrong[qid]) delete state.wrong[qid];
  }
  function wrongCount() {
    var n = 0;
    Object.keys(state.wrong).forEach(function (id) { if (QMAP[id]) n++; });
    return n;
  }

  /* ── 점수 계산 ────────────────────────── */
  function scoreOf(qids, ans) {
    var correct = 0, stats = {};
    qids.forEach(function (id) {
      var q = QMAP[id];
      if (!q) return;
      var st = stats[q.subject] || (stats[q.subject] = { total: 0, correct: 0 });
      st.total++;
      if (ans[id] === q.answer) { st.correct++; correct++; }
    });
    return {
      correct: correct,
      total: qids.length,
      score: qids.length ? Math.round(correct * 100 / qids.length) : 0,
      subjects: SUBJECTS.filter(function (s) { return stats[s]; }).map(function (s) {
        return { subject: s, total: stats[s].total, correct: stats[s].correct, rate: Math.round(stats[s].correct * 100 / stats[s].total) };
      })
    };
  }

  /* ── 공통 조각 ────────────────────────── */
  function subjectBadge(subject) {
    return h("span", { class: "badge subject-" + subject, text: subject });
  }
  function bar(pct, extra) {
    var fill = h("i");
    fill.setAttribute("style", "width:" + Math.max(0, Math.min(100, pct)) + "%");
    return h("div", { class: "bar" + (extra ? " " + extra : "") }, [fill]);
  }
  function choiceButton(ci, text, opts) {
    opts = opts || {};
    var cls = "choice" + (opts.extraClass ? " " + opts.extraClass : "");
    var attrs = { "data-act": "choice", "data-choice": ci, role: "radio", "aria-checked": opts.checked ? "true" : "false" };
    if (opts.disabled) attrs.disabled = "disabled";
    var mark = opts.mark ? h("span", { class: "mark", text: opts.mark }) : null;
    return h("button", { class: cls, attrs: attrs, on: opts.on ? { click: opts.on } : null }, [
      h("span", { class: "num", text: CIRCLE[ci] }),
      h("span", { class: "txt", text: text }),
      mark
    ]);
  }
  function explanationBlock(ok, q, mine) {
    var head = ok
      ? h("div", { class: "fb-head", text: "⭕ 정답이에요!" })
      : h("div", { class: "fb-head", text: "❌ 아쉬워요" });
    var ans = h("div", { class: "fb-answer" }, [
      h("span", { text: "정답 " + CIRCLE[q.answer] + " " + q.choices[q.answer] })
    ]);
    if (!ok && mine != null) {
      ans.appendChild(h("div", { class: "muted", text: "내가 고른 답 " + CIRCLE[mine] + " " + q.choices[mine] }));
    }
    return h("div", { class: "feedback " + (ok ? "ok" : "no") }, [
      head,
      ans,
      h("div", { class: "fb-exp" }, [
        h("span", { class: "fb-exp-title", text: "친절한 해설" }),
        h("span", { text: q.explanation })
      ])
    ]);
  }

  /* ── 탭 ───────────────────────────────── */
  function setTab(tab) {
    state.tab = tab;
    ui.tab = tab;
    if (tab === "practice") ui.practiceLimit = PRACTICE_PAGE;
    save();
    render();
    scrollTop();
  }
  function syncTabs() {
    ["exam", "practice", "summary"].forEach(function (t) {
      var btn = byId("tab-" + t);
      if (!btn) return;
      btn.setAttribute("aria-selected", t === state.tab ? "true" : "false");
    });
  }

  /* ── 실전 모의고사 ────────────────────── */
  function renderExamTab() {
    var examId = state.examId;
    var ids = idsOf(examId);
    if (!ids.length) {
      if (examId === "retry" || examId === "random") return renderNoSet(examId);
      state.examId = "1";
      examId = "1";
      ids = idsOf("1");
    }
    if (state.showResult === examId) return renderResult(examId);

    var ans = answersOf(examId);
    var idx = state.index[examId] || 0;
    if (idx < 0) idx = 0;
    if (idx > ids.length - 1) idx = ids.length - 1;
    state.index[examId] = idx;
    var qid = ids[idx];
    var q = QMAP[qid];
    var mine = ans[qid];
    var revealed = state.instant && mine != null;

    var root = h("div", { class: "tabpanel" });

    /* 상단: 회차 · 진행률 · 토글 */
    var roundChips = h("div", { class: "roundbar" }, [
      h("span", { class: "roundbar-title", text: "회차" })
    ]);
    DATA.mockExams.forEach(function (m) {
      var solved = solvedCount(String(m.id));
      roundChips.appendChild(h("button", {
        type: "button", class: "chip", attrs: { "data-act": "round", "data-round": m.id, "aria-pressed": examId === String(m.id) ? "true" : "false" },
        on: { click: function () { switchExam(String(m.id)); } }
      }, [
        h("span", { text: m.id + "회차" }),
        h("span", { class: "chip-sub", text: solved + "/60" })
      ]));
    });
    if (examId === "random" || examId === "retry") {
      roundChips.appendChild(h("button", {
        type: "button", class: "chip coral", attrs: { "aria-pressed": "true", "data-act": "cur" },
        on: { click: function () { toast(titleOf(examId) + "를 푸는 중이에요"); } }
      }, [h("span", { text: titleOf(examId) })]));
    }

    var solved = solvedCount(examId);
    var pct = Math.round(solved * 100 / ids.length);
    var toggleInput = h("input", {
      type: "checkbox", attrs: { id: "instantToggle", "data-act": "instant-toggle", role: "switch" },
      on: {
        change: function () {
          state.instant = !!toggleInput.checked;
          save(); render();
        }
      }
    });
    if (state.instant) toggleInput.checked = true;
    var toggleLabel = h("label", { class: "switch", attrs: { for: "instantToggle" } }, [
      toggleInput,
      h("span", { class: "track" }, [h("span", { class: "thumb" })]),
      h("span", { class: "state", text: state.instant ? "켜짐" : "꺼짐" })
    ]);

    root.appendChild(h("div", { class: "card exam-top" }, [
      roundChips,
      h("div", { class: "progress-head", attrs: { style: "margin-top:16px" }, role: "status", "aria-live": "polite" }, [
        h("span", { class: "label", text: titleOf(examId) + " · " + (idx + 1) + "번째 문제" }),
        h("span", { class: "count", text: (idx + 1) + " / " + ids.length })
      ]),
      bar(pct),
      h("div", { class: "progress-foot" }, [
        h("span", { text: "푼 문제 " + solved + "개" }),
        h("span", { text: "남은 " + (ids.length - solved) + "개 · " + pct + "% 진행" })
      ]),
      h("div", { class: "toggle-row" }, [
        h("div", { class: "toggle-text" }, [
          h("span", { text: "바로 정답 확인" }),
          h("small", { text: state.instant ? "선택하면 바로 정답과 해설을 보여줘요" : "실전처럼 60문제를 다 풀고 채점해요" })
        ]),
        toggleLabel
      ])
    ]));

    /* 문제 카드 */
    var choices = h("div", { class: "choices", attrs: { role: "radiogroup", "aria-label": "선택지" } });
    q.choices.forEach(function (text, ci) {
      var opts = { checked: mine === ci, on: function () { chooseExam(qid, ci); } };
      if (revealed) {
        if (ci === q.answer) { opts.extraClass = "is-correct"; opts.mark = "정답"; }
        else if (mine === ci) { opts.extraClass = "is-wrong"; opts.mark = "내 선택"; }
      }
      choices.appendChild(choiceButton(ci, text, opts));
    });

    var qcard = h("div", { class: "card qcard", attrs: { id: "qcard" } }, [
      h("div", { class: "qmeta" }, [
        subjectBadge(q.subject),
        h("span", { class: "qnum", text: (idx + 1) + "번" }),
        h("span", { class: "qsrc", text: q.source || "" })
      ]),
      h("h2", { class: "qtext", text: q.question }),
      choices
    ]);
    if (revealed) qcard.appendChild(explanationBlock(mine === q.answer, q, mine));
    root.appendChild(qcard);

    /* 이전/다음 */
    root.appendChild(h("div", { class: "navrow" }, [
      h("button", {
        type: "button", class: "btn", attrs: { "data-act": "prev" }, on: { click: function () { go(idx - 1); } }
      }, [h("span", { text: "◀ 이전 문제" })]),
      h("button", {
        type: "button", class: "btn", attrs: { "data-act": "next" }, on: { click: function () { go(idx + 1); } }
      }, [h("span", { text: "다음 문제 ▶" })])
    ]));

    /* 채점 */
    var left = ids.length - solved;
    var gradeKids = [
      h("button", {
        type: "button", class: "btn primary", attrs: { "data-act": "grade" },
        on: { click: function () { grade(examId); } }
      }, [h("span", { text: "채점하고 점수 보기" })]),
      h("p", { class: "hint", text: left > 0 ? "아직 " + left + "문제가 비어 있어요. 그래도 채점할 수 있어요." : "60문제를 다 풀었어요. 점수를 확인해 보세요!" })
    ];
    if (state.graded[examId]) {
      gradeKids.push(h("button", {
        type: "button", class: "btn small btn-outline-coral", attrs: { "data-act": "reshow-result", style: "width:100%;margin-top:8px" },
        on: { click: function () { showResult(examId); } }
      }, [h("span", { text: "점수표 다시 보기" })]));
    }
    root.appendChild(h("div", { class: "gradebox" }, gradeKids));

    /* 문항 번호표 */
    var grid = h("div", { class: "mapgrid" });
    ids.forEach(function (id, i) {
      var cls = ans[id] != null ? "solved" : "";
      if (i === idx) cls += " current";
      grid.appendChild(h("button", {
        type: "button", class: cls, attrs: { "data-act": "goto", "data-index": i, "aria-label": (i + 1) + "번 문제" + (ans[id] != null ? " (푼 문제)" : " (안 푼 문제)") , "aria-current": i === idx ? "true" : null },
        on: { click: function () { go(i); } }
      }, [String(i + 1)]));
    });
    var details = h("details", { class: "mapbox", attrs: { id: "mapbox", open: ui.mapOpen ? "open" : null } }, [
      h("summary", {}, [
        h("span", { text: "전체 문항 번호표 (" + ids.length + "문제)" }),
        h("span", { class: "caret", text: "▼" })
      ]),
      grid,
      h("div", { class: "legend" }, [
        h("span", {}, [h("i", { class: "solved" }), h("span", { text: "푼 문제 " + solved })]),
        h("span", {}, [h("i", { class: "" }), h("span", { text: "안 푼 문제 " + left })]),
        h("span", {}, [h("i", { class: "current" }), h("span", { text: "지금 문제" })])
      ])
    ]);
    details.addEventListener("toggle", function () { ui.mapOpen = !!details.open; });
    root.appendChild(details);

    if (idx === 0) {
      root.appendChild(h("p", { class: "kbd-hint", text: "💡 PC에서는 키보드 1~4로 답을 고르고, ← → 로 문제를 넘길 수 있어요." }));
    }
    return root;
  }

  function renderNoSet(examId) {
    var isRetry = examId === "retry";
    return h("div", { class: "tabpanel" }, [
      h("div", { class: "empty" }, [
        h("p", { text: isRetry ? "아직 오답노트가 비어 있어요. 모의고사를 먼저 풀어 주세요!" : "아직 문제 조합이 없어요." }),
        h("div", { class: "cta-wrap" }, [
          h("button", { type: "button", class: "btn primary", attrs: { "data-act": "go-exam" }, on: { click: function () { startExam("1"); } } }, [h("span", { text: "제1회 모의고사 풀기" })])
        ])
      ])
    ]);
  }

  function chooseExam(qid, ci) {
    var examId = state.examId;
    var ans = answersOf(examId);
    ans[qid] = ci;
    var q = QMAP[qid];
    if (state.instant) {
      if (ci === q.answer) forgetWrong(qid);
      else noteWrong(qid, ci);
    }
    delete state.graded[examId];
    if (state.showResult === examId) state.showResult = null;
    save();
    render();
  }

  function go(i) {
    var ids = idsOf(state.examId);
    if (!ids.length) return;
    var next = Math.max(0, Math.min(ids.length - 1, i));
    state.index[state.examId] = next;
    state.showResult = null;
    ui.scroll = true;
    save();
    render();
  }

  function switchExam(examId) {
    if (examId === state.examId) { state.showResult = null; render(); return; }
    var has = Object.keys(answersOf(examId)).length > 0;
    if (has && !confirmBox("제" + examId + "회에 저장된 답안이 있어요.\n그 회차로 이동할까요? (답안은 그대로 남아 있어요)")) return;
    state.examId = examId;
    state.showResult = null;
    save();
    render();
    scrollTop();
  }

  function startExam(examId) {
    if (examId === "random") {
      state.randomIds = buildRandomIds();
      state.answers.random = {};
    }
    var has = Object.keys(answersOf(examId)).length > 0 && examId !== "random";
    if (has) {
      if (!confirmBox("제" + examId + "회에 저장된 답안이 있어요.\n처음부터 새로 풀까요?")) return;
      state.answers[examId] = {};
    }
    state.examId = examId;
    state.index[examId] = 0;
    state.showResult = null;
    state.tab = "exam";
    save();
    render();
    scrollTop();
  }

  function grade(examId) {
    var ids = idsOf(examId), ans = answersOf(examId);
    ids.forEach(function (id) {
      var q = QMAP[id];
      if (!q) return;
      if (ans[id] === q.answer) forgetWrong(id);
      else noteWrong(id, ans[id] == null ? null : ans[id]);
    });
    state.graded[examId] = true;
    state.showResult = examId;
    save();
    render();
    scrollTop();
  }
  function showResult(examId) {
    state.showResult = examId;
    render();
    scrollTop();
  }

  function renderResult(examId) {
    var ids = idsOf(examId), ans = answersOf(examId);
    var res = scoreOf(ids, ans);
    var isFullSet = ids.length === 60;
    var passScore = (DATA.examInfo && DATA.examInfo.passScore) || 60;
    var passed = res.score >= passScore;
    var root = h("div", { class: "tabpanel result" });

    var pill = isFullSet
      ? h("div", { class: "pill " + (passed ? "pass" : "fail"), attrs: { id: "resultPill" } }, [
        h("span", { text: passed ? "🎉 합격" : "😢 불합격" })
      ])
      : h("div", { class: "pill plain", attrs: { id: "resultPill" } }, [h("span", { text: "정답률 " + res.score + "%" })]);

    var note = isFullSet
      ? (passed ? "합격 기준 " + passScore + "점을 넘었어요. 오답만 확인하고 다음 회차로 가 볼까요?" : "합격까지 " + (passScore - res.score) + "점 남았어요. 아래 오답 체크를 꼭 읽어 보세요.")
      : "틀렸던 문제만 모아서 다시 풀었어요.";

    root.appendChild(h("section", { class: "card scorecard", attrs: { id: "scorecard" } }, [
      h("p", { class: "score-label", text: titleOf(examId) + " 채점 결과" }),
      h("p", { class: "score-big" }, [
        h("span", { attrs: { id: "scoreValue" }, text: String(res.score) }),
        h("small", { text: "점" })
      ]),
      pill,
      h("p", { class: "score-sub", attrs: { id: "scoreCount" }, text: "맞힌 개수 " + res.correct + " / " + res.total }),
      h("p", { class: "score-note", text: note })
    ]));

    /* 과목별 정답률 */
    var statsBody = h("div", { class: "subjectstats", attrs: { id: "subjectStats" } }, [
      h("h3", { text: "📊 과목별 정답률" })
    ]);
    res.subjects.forEach(function (s) {
      statsBody.appendChild(h("div", { class: "subj-row", attrs: { "data-subject": s.subject } }, [
        h("div", { class: "sr-head" }, [
          h("span", { text: s.subject }),
          h("span", { class: "rate" }, [
            h("b", { text: s.rate + "%" }),
            h("span", { class: "cnt", text: s.correct + " / " + s.total })
          ])
        ]),
        bar(s.rate)
      ]));
    });
    root.appendChild(h("section", { class: "card" }, [statsBody]));

    /* 오답 체크 */
    var wrongIds = ids.filter(function (id) { return ans[id] !== QMAP[id].answer; });
    var wrongSec = h("section", { class: "card wrongsec", attrs: { id: "wrongSection" } }, [
      h("h3", {}, [
        h("span", { text: "❌ 오답 체크" }),
        h("span", { class: "badge", text: wrongIds.length + "문제" })
      ])
    ]);
    if (!wrongIds.length) {
      wrongSec.appendChild(h("div", { class: "wrong-empty", text: "🎉 모두 맞혔어요! 완벽해요, 엄마!" }));
    } else {
      wrongIds.forEach(function (id, n) {
        var q = QMAP[id];
        var mine = ans[id];
        var card = h("div", { class: "wrong-card", attrs: { "data-qid": id } }, [
          h("div", { class: "wc-head" }, [
            subjectBadge(q.subject),
            h("span", { class: "wc-num", text: "오답 " + (n + 1) + " · " + id })
          ]),
          h("div", { class: "wc-q", text: q.question }),
          h("div", { class: "ansline mine" }, [
            h("span", { class: "tag", text: "내가 고른 답" }),
            h("span", { text: mine == null ? "고르지 않음" : CIRCLE[mine] + " " + q.choices[mine] })
          ]),
          h("div", { class: "ansline right" }, [
            h("span", { class: "tag", text: "정답" }),
            h("span", { text: CIRCLE[q.answer] + " " + q.choices[q.answer] })
          ]),
          h("div", { class: "wc-exp" }, [
            h("span", { class: "fb-exp-title", text: "친절한 해설" }),
            h("span", { text: q.explanation })
          ])
        ]);
        wrongSec.appendChild(card);
      });
    }
    root.appendChild(wrongSec);

    /* 결과 조작 */
    if (wrongIds.length) {
      root.appendChild(h("div", { class: "result-actions" }, [
        h("button", {
          type: "button", class: "btn btn-outline-coral", attrs: { "data-act": "retry-wrong" },
          on: { click: function () { startRetry(wrongIds); } }
        }, [h("span", { text: "틀린 문제만 다시 풀기 (" + wrongIds.length + "문제)" })]),
        h("button", {
          type: "button", class: "btn ghost", attrs: { "data-act": "review" },
          on: { click: function () { state.showResult = null; render(); scrollTop(); } }
        }, [h("span", { text: "문제 다시 보기" })])
      ]));
    } else {
      root.appendChild(h("div", { class: "result-actions" }, [
        h("button", {
          type: "button", class: "btn", attrs: { "data-act": "review" },
          on: { click: function () { state.showResult = null; render(); scrollTop(); } }
        }, [h("span", { text: "문제 다시 보기" })])
      ]));
    }

    /* 핵심 CTA: 다음 모의고사 */
    var next = nextTarget(examId);
    if (next) {
      root.appendChild(h("div", { class: "cta-wrap" }, [
        h("button", {
          type: "button", class: "cta" + (next.random ? " coral" : ""), attrs: { "data-act": "next-exam", "data-target": next.id },
          on: { click: function () { startExam(next.id); } }
        }, [
          h("span", { class: "cta-top", text: next.top }),
          h("span", { class: "cta-sub", text: next.sub })
        ])
      ]));
    } else {
      root.appendChild(h("div", { class: "cta-wrap" }, [
        h("button", {
          type: "button", class: "cta coral", attrs: { "data-act": "go-exam" },
          on: { click: function () { startExam("1"); } }
        }, [
          h("span", { class: "cta-top", text: "모의고사 처음부터 다시 풀까요?" }),
          h("span", { class: "cta-sub", text: "제1회 60문제 새로 풀기" })
        ])
      ]));
    }
    return root;
  }

  function nextTarget(examId) {
    var list = (DATA.mockExams || []).map(function (m) { return String(m.id); });
    var i = list.indexOf(String(examId));
    if (i >= 0 && i < list.length - 1) {
      var n = list[i + 1];
      return { id: n, top: "다음 모의고사를 풀까요?", sub: "제" + n + "회 새로운 60문제 풀기 →" };
    }
    if (i === list.length - 1) {
      var total = (DATA.questions || []).length;
      return {
        id: "random", random: true,
        top: total + "문항 중 랜덤 60문제에 도전할까요?",
        sub: "1~" + list.length + "회차에서 골고루 섞어 새 조합으로 풀기 →"
      };
    }
    if (examId === "random") return { id: list[0] || "1", top: "제1회부터 다시 풀까요?", sub: "제1회 60문제 풀기 →" };
    return null;
  }

  function startRetry(ids) {
    state.retryIds = ids.slice();
    state.answers.retry = {};
    state.examId = "retry";
    state.index.retry = 0;
    state.showResult = null;
    state.tab = "exam";
    save();
    render();
    scrollTop();
  }

  /* ── 과목별 연습 · 오답노트 ───────────── */
  function practiceIds() {
    if (ui.practiceKind === "wrong") {
      var w = Object.keys(state.wrong).filter(function (id) { return !!QMAP[id]; });
      w.sort(function (a, b) { return a < b ? -1 : a > b ? 1 : 0; });
      return w;
    }
    var list = DATA.questions.filter(function (q) {
      return ui.practiceValue === "all" || q.subject === ui.practiceValue;
    });
    return list.map(function (q) { return q.id; });
  }
  function renderPracticeTab() {
    var root = h("div", { class: "tabpanel practice" });
    var chips = h("div", { class: "chips", attrs: { role: "group", "aria-label": "과목 선택" } });
    var allCount = DATA.questions.length;
    chips.appendChild(h("button", {
      type: "button", class: "chip", attrs: { "data-act": "subject", "data-subject": "all", "aria-pressed": ui.practiceKind === "subject" && ui.practiceValue === "all" ? "true" : "false" },
      on: { click: function () { setPractice("subject", "all"); } }
    }, [h("span", { text: "전체" }), h("span", { class: "chip-sub", text: String(allCount) })]));
    SUBJECTS.forEach(function (s) {
      var n = DATA.questions.filter(function (q) { return q.subject === s; }).length;
      chips.appendChild(h("button", {
        type: "button", class: "chip", attrs: { "data-act": "subject", "data-subject": s, "aria-pressed": ui.practiceKind === "subject" && ui.practiceValue === s ? "true" : "false" },
        on: { click: function () { setPractice("subject", s); } }
      }, [h("span", { text: s }), h("span", { class: "chip-sub", text: String(n) })]));
    });
    chips.appendChild(h("button", {
      type: "button", class: "chip coral", attrs: { "data-act": "wrongnote", "aria-pressed": ui.practiceKind === "wrong" ? "true" : "false" },
      on: { click: function () { setPractice("wrong", null); } }
    }, [h("span", { text: "📕 내 오답노트" }), h("span", { class: "chip-sub", text: String(wrongCount()) })]));

    root.appendChild(h("div", { class: "card practice-top" }, [
      chips,
      h("p", { class: "practice-note", text: ui.practiceKind === "wrong"
        ? "모의고사에서 틀렸던 문제만 모았어요. 선택지를 누르면 바로 정답과 해설이 나와요."
        : "선택지를 누르면 바로 정답과 해설을 확인할 수 있어요." })
    ]));

    var ids = practiceIds();
    var list = h("div", { class: "plist", attrs: { id: "practiceList" } });
    if (!ids.length) {
      list.appendChild(h("div", { class: "empty" }, [
        h("p", { text: ui.practiceKind === "wrong" ? "아직 오답노트가 비어 있어요. 모의고사를 풀면 틀린 문제가 자동으로 모여요!" : "문제가 없어요." })
      ]));
    }
    var shown = ids.slice(0, ui.practiceLimit);
    shown.forEach(function (id) {
      var q = QMAP[id];
      if (!q) return;
      if (ui.practiceKind === "wrong") {
        list.appendChild(renderWrongNoteCard(q));
      } else {
        list.appendChild(renderPracticeCard(q));
      }
    });
    root.appendChild(list);

    if (ids.length > shown.length) {
      root.appendChild(h("div", { class: "more-row" }, [
        h("button", {
          type: "button", class: "btn", attrs: { "data-act": "more" },
          on: { click: function () { ui.practiceLimit += PRACTICE_PAGE; render(); } }
        }, [h("span", { text: "문제 더 보기 (" + (ids.length - shown.length) + "개 남음)" })])
      ]));
    }
    root.appendChild(h("div", { class: "more-row" }, [
      h("span", { class: "muted", attrs: { style: "font-size:.84rem;font-weight:700" }, text: "총 " + ids.length + "문제 · " + shown.length + "문제 표시 중" })
    ]));
    return root;
  }

  function setPractice(kind, value) {
    ui.practiceKind = kind;
    ui.practiceValue = value == null ? "all" : value;
    ui.practiceLimit = PRACTICE_PAGE;
    render();
  }

  function renderPracticeCard(q) {
    var picked = ui.reveal[q.id];
    var revealed = picked != null;
    var choices = h("div", { class: "choices", attrs: { role: "radiogroup", "aria-label": "선택지" } });
    q.choices.forEach(function (text, ci) {
      var opts = {
        checked: picked === ci,
        on: function () { ui.reveal[q.id] = ci; render(); }
      };
      if (revealed) {
        if (ci === q.answer) { opts.extraClass = "is-correct"; opts.mark = "정답"; }
        else if (picked === ci) { opts.extraClass = "is-wrong"; opts.mark = "내 선택"; }
      }
      choices.appendChild(choiceButton(ci, text, opts));
    });
    var card = h("div", { class: "pcard", attrs: { "data-qid": q.id } }, [
      h("div", { class: "qmeta" }, [
        subjectBadge(q.subject),
        h("span", { class: "wc-num", text: q.id }),
        h("span", { class: "qsrc", text: q.source || "" })
      ]),
      h("div", { class: "wc-q", text: q.question }),
      choices
    ]);
    if (revealed) card.appendChild(explanationBlock(picked === q.answer, q, picked));
    return card;
  }

  function renderWrongNoteCard(q) {
    var note = state.wrong[q.id] || {};
    var mine = note.chosen;
    return h("div", { class: "pcard wrong-card", attrs: { "data-qid": q.id } }, [
      h("div", { class: "wc-head" }, [
        subjectBadge(q.subject),
        h("span", { class: "wc-num", text: q.id }),
        h("span", { class: "qsrc", text: q.source || "" })
      ]),
      h("div", { class: "wc-q", text: q.question }),
      h("div", { class: "ansline mine" }, [
        h("span", { class: "tag", text: "내가 고른 답" }),
        h("span", { text: mine == null ? "고르지 않음" : CIRCLE[mine] + " " + q.choices[mine] })
      ]),
      h("div", { class: "ansline right" }, [
        h("span", { class: "tag", text: "정답" }),
        h("span", { text: CIRCLE[q.answer] + " " + q.choices[q.answer] })
      ]),
      h("div", { class: "wc-exp" }, [
        h("span", { class: "fb-exp-title", text: "친절한 해설" }),
        h("span", { text: q.explanation })
      ]),
      h("div", { attrs: { style: "margin-top:12px;text-align:right" } }, [
        h("button", {
          type: "button", class: "btn small ghost", attrs: { "data-act": "forget", "data-qid": q.id },
          on: { click: function () { forgetWrong(q.id); save(); render(); toast("오답노트에서 지웠어요"); } }
        }, [h("span", { text: "이 문제는 이제 알아요 (빼기)" })])
      ])
    ]);
  }

  /* ── 요점 정리 ────────────────────────── */
  function renderSummaryTab() {
    var root = h("div", { class: "tabpanel summary" });
    var total = 0;
    DATA.summaries.forEach(function (s) { total += s.items.length; });
    root.appendChild(h("p", { class: "summary-intro", text: "과목별 핵심만 " + total + "개 카드로 모았어요. 시험 전에 한 번씩 읽어 보세요." }));
    var jump = h("div", { class: "sumjump" });
    DATA.summaries.forEach(function (s, i) {
      jump.appendChild(h("button", {
        type: "button", class: "chip", attrs: { "data-act": "jump", "data-target": "sum-" + i },
        on: { click: function () { scrollToNode(byId("sum-" + i)); } }
      }, [h("span", { text: s.subject }), h("span", { class: "chip-sub", text: String(s.items.length) })]));
    });
    root.appendChild(jump);

    DATA.summaries.forEach(function (s, i) {
      var sec = h("section", { class: "sum-sec", attrs: { id: "sum-" + i } }, [
        h("h3", {}, [h("span", { text: "📖 " + s.subject }), h("span", { class: "badge", text: s.items.length + "개" })])
      ]);
      s.items.forEach(function (it, n) {
        sec.appendChild(h("div", { class: "sum-card" }, [
          h("h4", {}, [h("span", { class: "idx", text: String(n + 1) }), h("span", { text: it.title })]),
          h("p", { text: it.content })
        ]));
      });
      root.appendChild(sec);
    });
    return root;
  }

  /* ── 토스트 ───────────────────────────── */
  var toastTimer = null;
  function toast(msg) {
    var t = byId("toast");
    if (!t) {
      t = h("div", { class: "toast", attrs: { id: "toast", role: "status", "aria-live": "polite" } });
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add("show");
    if (toastTimer && typeof clearTimeout === "function") clearTimeout(toastTimer);
    toastTimer = later(function () { t.classList.remove("show"); }, 2200);
  }

  /* ── 렌더 ─────────────────────────────── */
  function render() {
    var app = byId("app");
    if (!app) return;
    clear(app);
    var view;
    if (state.tab === "practice") view = renderPracticeTab();
    else if (state.tab === "summary") view = renderSummaryTab();
    else view = renderExamTab();
    app.appendChild(view);
    syncTabs();
    if (ui.scroll) {
      ui.scroll = false;
      scrollToNode(byId("qcard"));
    }
  }

  /* ── 시작 ─────────────────────────────── */
  function start(data) {
    DATA = data;
    QMAP = {};
    DATA.questions.forEach(function (q) { QMAP[q.id] = q; });
    state = loadState();
    ui.tab = state.tab;
    var loading = byId("loading");
    if (loading) loading.hidden = true;
    var app = byId("app");
    if (app) app.hidden = false;

    ["exam", "practice", "summary"].forEach(function (t) {
      var btn = byId("tab-" + t);
      if (btn) btn.addEventListener("click", function () { setTab(t); });
    });
    var reset = byId("resetBtn");
    if (reset) {
      reset.addEventListener("click", function () {
        if (!confirmBox("모든 답안과 오답노트를 지우고 처음부터 시작할까요?")) return;
        try { if (window.localStorage) window.localStorage.removeItem(LS_KEY); } catch (e) {}
        state = defaultState();
        ui.reveal = {};
        ui.practiceKind = "subject";
        ui.practiceValue = "all";
        render();
        scrollTop();
        toast("기록을 모두 지웠어요");
      });
    }
    render();
    document.addEventListener("keydown", function (e) { handleKey(e); });
    window.__MOM_BAKERY__ = {
      getState: function () { return state; },
      getData: function () { return DATA; },
      getUi: function () { return ui; }
    };
  }

  /* ── PC 키보드 ────────────────────────── */
  function handleKey(e) {
    if (!state || state.tab !== "exam" || state.showResult) return;
    var t = e.target;
    var tag = t && t.tagName ? String(t.tagName).toUpperCase() : "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var key = e.key;
    var ids = idsOf(state.examId);
    if (!ids.length) return;
    var idx = state.index[state.examId] || 0;
    if (key >= "1" && key <= "4") {
      var qid = ids[idx];
      if (!qid || !QMAP[qid]) return;
      if (typeof e.preventDefault === "function") e.preventDefault();
      chooseExam(qid, Number(key) - 1);
    } else if (key === "ArrowRight") {
      if (typeof e.preventDefault === "function") e.preventDefault();
      go(idx + 1);
    } else if (key === "ArrowLeft") {
      if (typeof e.preventDefault === "function") e.preventDefault();
      go(idx - 1);
    }
  }

  function fatal(msg) {
    var loading = byId("loading");
    if (loading) loading.hidden = true;
    var box = byId("fatal");
    if (box) {
      box.hidden = false;
      box.textContent = msg;
    }
  }

  function boot() {
    if (window.__MOM_BAKERY_DATA__) { start(window.__MOM_BAKERY_DATA__); return; }
    if (typeof fetch === "function") {
      fetch("./data/questions.json").then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      }).then(start).catch(function (e) {
        fatal("문제 데이터를 불러오지 못했어요. (" + e.message + ")");
      });
    } else {
      fatal("문제 데이터를 찾을 수 없어요.");
    }
  }

  boot();
})();
