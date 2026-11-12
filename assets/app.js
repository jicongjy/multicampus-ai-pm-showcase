(function () {
  "use strict";

  var data = null, works = [], links = [], lessons = [], terms = [], notes = [];
  var view = document.getElementById("view");
  var $ = function (id) { return document.getElementById(id); };

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === "text") n.textContent = v;
      else n.setAttribute(k, v === true ? "" : v);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }
  function txt(s) { return document.createTextNode(s); }
  function enc(path) { return path.split("/").map(encodeURIComponent).join("/"); }
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function iso(y, m, d) { return y + "-" + pad(m) + "-" + pad(d); }
  var DOW = ["일", "월", "화", "수", "목", "금", "토"];
  function parts(date) { var a = date.split("-"); return { y: +a[0], m: +a[1], d: +a[2] }; }
  function utc(date) { var p = parts(date); return Date.UTC(p.y, p.m - 1, p.d); }
  function dowOf(date) { return new Date(utc(date)).getUTCDay(); }
  function addDays(date, n) { var t = new Date(utc(date) + n * 86400000); return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()); }
  function diffDays(a, b) { return Math.round((utc(a) - utc(b)) / 86400000); }
  function koDay(date) { var p = parts(date); return p.m + "월 " + p.d + "일 (" + DOW[dowOf(date)] + ")"; }
  function mmdd(date) { var p = parts(date); return p.m + "." + p.d; }
  function host(url) { try { return new URL(url).hostname.replace(/^www\./, ""); } catch (e) { return url; } }

  var now = new Date();
  var TODAY = iso(now.getFullYear(), now.getMonth() + 1, now.getDate());

  /* ---------- data helpers ---------- */
  function weekOf(id) { return data.weeks.filter(function (w) { return w.id === id; })[0] || data.weeks[0]; }
  function workById(id) { return works.filter(function (w) { return w.id === id; })[0]; }
  function noteById(id) { return notes.filter(function (n) { return n.id === id; })[0]; }
  function termByName(n) { return terms.filter(function (t) { return t.name === n; })[0]; }
  function isNew(date) { var d = diffDays(TODAY, date); return d >= 0 && d <= 3; }
  function termsOfWork(id) { return terms.filter(function (t) { return t.works.indexOf(id) !== -1; }); }
  function notesOfWork(id) { return notes.filter(function (n) { return n.works.indexOf(id) !== -1; }); }

  function noteTitle(n) {
    var t = n.title
      .replace(/^\d{4}-\d{2}-\d{2}\s*/, "")
      .replace(/^AI\s*(프로덕트\s*매니저|PM\s*캠프)\s*(과정,?)?\s*/, "")
      .replace(/^\d+주차\s*[·]?\s*/, "")
      .replace(/^DAY\s*\d+\s*[·:]?\s*/i, "")
      .replace(/^\d+일차\s*/, "")
      .replace(/^학습\s*노트\s*[:：]?\s*/, "")
      .replace(/^노트\s*[:：]?\s*/, "")
      .replace(/\s*학습\s*노트$/, "")
      .trim();
    return t.length >= 3 ? t : koDay(n.date) + " 노트";
  }

  /* ---------- hash routing ---------- */
  function parseHash() {
    var h = location.hash.replace(/^#/, "");
    var qi = h.indexOf("?");
    var pathStr = qi === -1 ? h : h.slice(0, qi);
    var q = {};
    if (qi !== -1) h.slice(qi + 1).split("&").forEach(function (kv) {
      var p = kv.split("=");
      if (p[0]) q[decodeURIComponent(p[0])] = decodeURIComponent((p[1] || "").replace(/\+/g, " "));
    });
    return { path: pathStr.split("/").filter(Boolean).map(decodeURIComponent), q: q };
  }
  function href(path, q) {
    var s = "#/" + path.map(encodeURIComponent).join("/");
    var ks = Object.keys(q || {}).filter(function (k) { return q[k] !== "" && q[k] !== undefined; });
    if (ks.length) s += "?" + ks.map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(q[k]); }).join("&");
    return s;
  }

  /* ---------- shared pieces ---------- */
  function chip(text) { return el("span", { class: "chip", text: text }); }
  function termChip(name) { return el("a", { class: "chip link", href: href(["terms", name]), text: name }); }
  function dot() { return el("span", { class: "newdot", title: "최근에 추가했습니다" }); }
  function empty(msg) { return el("p", { class: "empty", text: msg }); }
  function secHead(title, more) {
    return el("div", { class: "sec-head" }, [el("h2", { text: title }), more ? el("a", { class: "more", href: more[1], text: more[0] }) : null]);
  }

  function thumbBox(w) {
    var box = el("div", { class: "thumb" });
    function ph() { box.textContent = ""; box.appendChild(el("div", { class: "ph", text: w.title.charAt(0) })); }
    if (w.thumb) {
      var img = el("img", { src: enc(w.thumb), alt: "", loading: "lazy", decoding: "async" });
      img.addEventListener("error", ph);
      box.appendChild(img);
    } else ph();
    return box;
  }

  /* 결과물 카드: 그림, 제목, 무엇을 했는지, 날짜·주차, 쓴 용어 */
  function workCard(w) {
    var used = termsOfWork(w.id);
    return el("a", { class: "card wcard", href: href(["projects", w.id]) }, [
      thumbBox(w),
      el("div", { class: "cbody" }, [
        el("h3", { text: w.title }),
        el("p", { class: "did", text: w.did || "" }),
        el("p", { class: "meta" }, [isNew(w.date) ? dot() : null, txt(mmdd(w.date) + " · " + weekOf(w.week).label + " · " + w.type)]),
        used.length ? el("div", { class: "chips" }, used.slice(0, 4).map(function (t) { return chip(t.name); })) : null
      ])
    ]);
  }

  /* 노트 행: 날짜·주차, 제목, 이날 한 것, 배운 용어 */
  function noteRow(n) {
    return el("a", { class: "row", href: href(["notes", n.id]) }, [
      el("p", { class: "meta" }, [isNew(n.date) ? dot() : null, txt(koDay(n.date) + " · " + weekOf(n.week).label)]),
      el("h3", { text: noteTitle(n) }),
      n.one ? el("p", { class: "did", text: n.one }) : null,
      n.terms.length ? el("div", { class: "chips" }, n.terms.map(chip)) : null
    ]);
  }

  /* 벽돌 배치: 카드를 열마다 순서대로 놓는다 */
  function masonry(items, build) {
    var box = el("div", { class: "mason" });
    var cols = 0;
    function layout() {
      var w = box.clientWidth || view.clientWidth || 900;
      var n = w >= 820 ? 3 : w >= 520 ? 2 : 1;
      if (n === cols) return;
      cols = n;
      box.textContent = "";
      var cs = [];
      for (var i = 0; i < n; i++) { var c = el("div", { class: "mcol" }); cs.push(c); box.appendChild(c); }
      items.forEach(function (it, i2) { cs[i2 % n].appendChild(build(it)); });
    }
    box._layout = layout;
    masonry.hosts.push(box);
    setTimeout(layout, 0);
    return box;
  }
  masonry.hosts = [];
  window.addEventListener("resize", function () {
    masonry.hosts = masonry.hosts.filter(function (h) { return document.body.contains(h); });
    masonry.hosts.forEach(function (h) { h._layout(); });
  });

  /* ---------- 잔디 ---------- */
  function activity() {
    var map = {};
    function at(d) { return map[d] || (map[d] = { works: [], notes: [], terms: [] }); }
    works.forEach(function (w) { at(w.date).works.push(w); });
    notes.forEach(function (n) { at(n.date).notes.push(n); });
    terms.forEach(function (t) { at(t.first).terms.push(t); });
    return map;
  }
  function total(a) { return a ? a.works.length + a.notes.length + a.terms.length : 0; }
  function level(c) { return c === 0 ? 0 : c <= 1 ? 1 : c <= 3 ? 2 : c <= 5 ? 3 : 4; }
  var COLS = 12;

  function grass(map, onPick) {
    var first = data.weeks[0].start;
    var start = addDays(first, -((dowOf(first) + 6) % 7));
    var wrap = el("div", { class: "grass-wrap" });
    var days = el("div", { class: "g-days" }, ["월", "", "수", "", "금", "", ""].map(function (d) { return el("span", { text: d }); }));
    var months = el("div", { class: "g-months" });
    var grid = el("div", { class: "grass", role: "group", "aria-label": "날짜별 기록량" });
    var cells = {};
    var lastMonth = 0;
    for (var c = 0; c < COLS; c++) {
      var colStart = addDays(start, c * 7);
      var mo = parts(colStart).m;
      months.appendChild(el("span", { text: mo !== lastMonth ? mo + "월" : "" }));
      lastMonth = mo;
      for (var r = 0; r < 7; r++) {
        var d = addDays(colStart, r);
        var n = total(map[d]);
        var future = d > TODAY && n === 0;
        var cell = el("button", {
          type: "button",
          class: "cell l" + level(n) + (d === TODAY ? " today" : "") + (future ? " future" : ""),
          "aria-label": koDay(d) + " 기록 " + n + "개",
          title: koDay(d) + " · 기록 " + n + "개"
        });
        if (!future) cell.addEventListener("click", (function (dd) { return function () { onPick(dd); }; })(d));
        cells[d] = cell;
        grid.appendChild(cell);
      }
    }
    wrap.appendChild(el("div", { class: "g-top" }, [el("span", { class: "g-sp" }), months]));
    wrap.appendChild(el("div", { class: "g-body" }, [days, grid]));
    wrap.appendChild(el("div", { class: "g-legend" }, [
      txt("적음"),
      el("i", { class: "cell l0" }), el("i", { class: "cell l1" }), el("i", { class: "cell l2" }), el("i", { class: "cell l3" }), el("i", { class: "cell l4" }),
      txt("많음"),
      el("span", { class: "g-today" }, [el("i", { class: "cell l0 today" }), txt("오늘")])
    ]));
    wrap._cells = cells;
    return wrap;
  }

  function dayPanel(map, date) {
    var a = map[date];
    var box = el("div", { class: "daypanel" });
    box.appendChild(el("h3", { text: koDay(date) }));
    if (!total(a)) { box.appendChild(el("p", { class: "sub", text: "이날은 기록이 없습니다." })); return box; }
    var rows = [];
    a.works.forEach(function (w) { rows.push(["결과물", w.title, href(["projects", w.id])]); });
    a.notes.forEach(function (n) { rows.push(["노트", noteTitle(n), href(["notes", n.id])]); });
    a.terms.forEach(function (t) { rows.push(["용어", t.name, href(["terms", t.name])]); });
    box.appendChild(el("ul", { class: "dlist" }, rows.map(function (r) {
      return el("li", {}, [el("span", { class: "kind", text: r[0] }), el("a", { href: r[2], text: r[1] })]);
    })));
    return box;
  }

  function counts(w) {
    return {
      w: works.filter(function (x) { return x.week === w.id; }).length,
      n: notes.filter(function (x) { return x.week === w.id; }).length,
      t: terms.filter(function (x) { return x.first >= w.start && x.first <= w.end; }).length
    };
  }
  function nums(c, big) {
    return el("p", { class: "nums" + (big ? " big" : "") }, [
      el("span", {}, [el("b", { text: "" + c.w }), txt(" 결과물")]),
      el("span", {}, [el("b", { text: "" + c.n }), txt(" 노트")]),
      el("span", {}, [el("b", { text: "" + c.t }), txt(" 용어")])
    ]);
  }

  /* ---------- 홈 ---------- */
  function viewHome() {
    var map = activity();
    var page = el("div", { class: "page" });
    page.appendChild(el("h1", { text: "학습 기록" }));
    page.appendChild(el("p", { class: "lead", text: "결과물 " + works.length + "개 · 노트 " + notes.length + "개 · 용어 " + terms.length + "개" }));

    var dates = Object.keys(map).filter(function (d) { return total(map[d]) > 0; }).sort();
    var pick = dates.filter(function (d) { return d <= TODAY; }).pop() || dates[dates.length - 1];
    var panelHost = el("div");
    var g = grass(map, function (d) { select(d); });
    function select(d) {
      Object.keys(g._cells).forEach(function (k) { g._cells[k].classList.toggle("sel", k === d); });
      panelHost.textContent = "";
      panelHost.appendChild(dayPanel(map, d));
    }
    page.appendChild(el("section", { class: "block" }, [secHead("잔디"), el("div", { class: "card pad" }, [g, panelHost])]));
    if (pick) select(pick);

    var wk = el("section", { class: "block" }, [secHead("주차별 변화", ["주차 보기", href(["weeks"])])]);
    wk.appendChild(el("div", { class: "grid3" }, data.weeks.slice().reverse().map(function (w) {
      return el("a", { class: "card pad wk", href: href(["weeks"]) }, [
        el("h3", { text: w.label }),
        el("p", { class: "sub", text: w.period }),
        nums(counts(w))
      ]);
    })));
    page.appendChild(wk);

    var recent = [];
    works.forEach(function (w) { recent.push({ date: w.date, kind: "결과물", title: w.title, sub: w.did, href: href(["projects", w.id]) }); });
    notes.forEach(function (n) { recent.push({ date: n.date, kind: "노트", title: noteTitle(n), sub: n.one, href: href(["notes", n.id]) }); });
    recent.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
    page.appendChild(el("section", { class: "block" }, [secHead("최근 추가"), el("div", { class: "card list" }, recent.slice(0, 6).map(function (r) {
      return el("a", { class: "li", href: r.href }, [
        el("span", { class: "kind", text: r.kind }),
        el("span", { class: "li-main" }, [el("b", {}, [isNew(r.date) ? dot() : null, txt(r.title)]), r.sub ? el("span", { class: "sub", text: r.sub }) : null]),
        el("span", { class: "sub date", text: mmdd(r.date) })
      ]);
    }))]));

    var rt = terms.slice().sort(function (a, b) { return a.first < b.first ? 1 : a.first > b.first ? -1 : a.name < b.name ? -1 : 1; }).slice(0, 6);
    page.appendChild(el("section", { class: "block" }, [secHead("최근 배운 용어", ["용어 전체", href(["terms"])]), el("div", { class: "grid3" }, rt.map(function (t) {
      return el("a", { class: "card pad tcard", href: href(["terms", t.name]) }, [
        el("h3", {}, [isNew(t.first) ? dot() : null, txt(t.name)]),
        el("p", { class: "did", text: t.def }),
        el("p", { class: "meta", text: mmdd(t.first) + " 처음" })
      ]);
    }))]));
    view.appendChild(page);
  }

  /* ---------- 주차 ---------- */
  function viewWeeks() {
    var page = el("div", { class: "page" });
    page.appendChild(el("h1", { text: "주차" }));
    var jump = el("div", { class: "pills jump" }, data.weeks.slice().reverse().map(function (w) {
      var a = el("a", { class: "pill", href: "#/weeks", text: w.label });
      a.addEventListener("click", function (e) {
        e.preventDefault();
        var t = document.getElementById("wk-" + w.id);
        if (t) t.scrollIntoView({ block: "start" });
      });
      return a;
    }));
    page.appendChild(jump);
    data.weeks.slice().reverse().forEach(function (w) {
      var sec = el("section", { class: "block weeksec", id: "wk-" + w.id });
      sec.appendChild(el("div", { class: "sec-head" }, [el("h2", { text: w.label }), el("span", { class: "sub", text: w.period })]));
      sec.appendChild(nums(counts(w), true));

      var ws = works.filter(function (x) { return x.week === w.id; }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
      if (ws.length) { sec.appendChild(el("h3", { class: "sub-h", text: "결과물" })); sec.appendChild(masonry(ws, workCard)); }
      var ns = notes.filter(function (x) { return x.week === w.id; }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
      sec.appendChild(el("h3", { class: "sub-h", text: "노트" }));
      sec.appendChild(ns.length ? el("div", { class: "card list rows" }, ns.map(noteRow)) : el("p", { class: "sub", text: "이 주차에는 공개한 노트가 없습니다." }));
      var ts = terms.filter(function (x) { return x.first >= w.start && x.first <= w.end; });
      if (ts.length) {
        sec.appendChild(el("h3", { class: "sub-h", text: "처음 나온 용어" }));
        sec.appendChild(el("div", { class: "chips wide" }, ts.map(function (t) { return termChip(t.name); })));
      }
      var ls = lessons.filter(function (x) { return x.week === w.id; });
      if (ls.length) {
        sec.appendChild(el("h3", { class: "sub-h", text: "교안" }));
        sec.appendChild(el("ul", { class: "plain" }, ls.map(function (l) {
          return el("li", {}, [el("a", { href: l.url, target: "_blank", rel: "noopener noreferrer", text: l.title + " ↗" })]);
        })));
      }
      page.appendChild(sec);
    });
    view.appendChild(page);
  }

  /* ---------- 결과물 ---------- */
  function filterBar(label, values, current, mk) {
    return el("div", { class: "filter" }, [
      el("span", { class: "flabel", text: label }),
      el("div", { class: "pills" }, [{ id: "", t: "전체" }].concat(values).map(function (v) {
        return el("a", { class: "pill" + (current === v.id ? " on" : ""), href: mk(v.id), text: v.t });
      }))
    ]);
  }

  function viewProjects(q) {
    var page = el("div", { class: "page" });
    page.appendChild(el("h1", { text: "결과물" }));
    var types = [];
    works.forEach(function (w) { if (types.indexOf(w.type) === -1) types.push(w.type); });
    page.appendChild(filterBar("주차", data.weeks.map(function (w) { return { id: w.id, t: w.label }; }), q.week || "", function (v) { return href(["projects"], { week: v, type: q.type }); }));
    page.appendChild(filterBar("종류", types.map(function (t) { return { id: t, t: t }; }), q.type || "", function (v) { return href(["projects"], { week: q.week, type: v }); }));
    var list = works.filter(function (w) { return (!q.week || w.week === q.week) && (!q.type || w.type === q.type); })
      .sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
    page.appendChild(el("p", { class: "sub count", text: list.length + "개" }));
    page.appendChild(list.length ? masonry(list, workCard) : empty("조건에 맞는 결과물이 없습니다."));
    view.appendChild(page);
  }

  function viewWork(id) {
    var w = workById(id);
    if (!w) { view.appendChild(el("div", { class: "page" }, [el("h1", { text: "찾을 수 없습니다" }), el("a", { class: "pill", href: href(["projects"]), text: "결과물 목록" })])); return; }
    var page = el("div", { class: "page narrow" });
    page.appendChild(el("a", { class: "back", href: href(["projects"]), text: "← 결과물" }));
    page.appendChild(el("p", { class: "meta" }, [isNew(w.date) ? dot() : null, txt(koDay(w.date) + " · " + weekOf(w.week).label + " · " + w.type)]));
    page.appendChild(el("h1", { text: w.title }));
    page.appendChild(el("p", { class: "lead", text: w.did || "" }));
    var btns = el("div", { class: "btns" });
    if (w.file) btns.appendChild(el("a", { class: "btn primary", href: enc(w.file), target: "_blank", rel: "noopener noreferrer", text: "열어 보기 ↗" }));
    (w.links || []).forEach(function (l) { btns.appendChild(el("a", { class: "btn", href: l.url, target: "_blank", rel: "noopener noreferrer", text: l.label + " ↗" })); });
    if (btns.childNodes.length) page.appendChild(btns);
    if (w.thumb) page.appendChild(el("div", { class: "card shot" }, [thumbBox(w)]));

    var used = termsOfWork(w.id);
    if (used.length) page.appendChild(el("section", { class: "block" }, [secHead("쓴 용어"), el("div", { class: "chips wide" }, used.map(function (t) { return termChip(t.name); }))]));
    var ns = notesOfWork(w.id);
    if (ns.length) page.appendChild(el("section", { class: "block" }, [secHead("관련 노트"), el("div", { class: "card list rows" }, ns.map(noteRow))]));

    var sorted = works.slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1; });
    var i = sorted.indexOf(w);
    var nav = el("div", { class: "pn" });
    if (sorted[i - 1]) nav.appendChild(el("a", { class: "card pad pn-item", href: href(["projects", sorted[i - 1].id]) }, [el("span", { class: "sub", text: "← 이전" }), el("b", { text: sorted[i - 1].title })]));
    if (sorted[i + 1]) nav.appendChild(el("a", { class: "card pad pn-item next", href: href(["projects", sorted[i + 1].id]) }, [el("span", { class: "sub", text: "다음 →" }), el("b", { text: sorted[i + 1].title })]));
    page.appendChild(nav);
    view.appendChild(page);
  }

  /* ---------- 노트 (목록 + 읽기) ---------- */
  function isDesktop() { return window.matchMedia("(min-width: 961px)").matches; }

  function viewNotes(id) {
    var sorted = notes.slice().sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
    var cur = id ? noteById(id) : null;
    if (!cur && isDesktop() && sorted.length) cur = sorted[0];
    var split = el("div", { class: "split" + (cur ? " has-sel" : "") });
    var list = el("div", { class: "split-list" });
    list.appendChild(el("h1", { class: "split-h", text: "노트" }));
    if (!sorted.length) list.appendChild(empty("공개한 노트가 아직 없습니다."));
    sorted.forEach(function (n) {
      list.appendChild(el("a", { class: "item" + (cur && cur.id === n.id ? " on" : ""), href: href(["notes", n.id]) }, [
        el("p", { class: "meta" }, [isNew(n.date) ? dot() : null, txt(koDay(n.date) + " · " + weekOf(n.week).label)]),
        el("h3", { text: noteTitle(n) }),
        n.one ? el("p", { class: "did", text: n.one }) : null
      ]));
    });
    var read = el("article", { class: "split-read" });
    if (cur) {
      read.appendChild(el("a", { class: "back only-m", href: href(["notes"]), text: "← 노트 목록" }));
      read.appendChild(el("p", { class: "meta", text: koDay(cur.date) + " · " + weekOf(cur.week).label }));
      read.appendChild(el("h1", { text: noteTitle(cur) }));
      if (cur.one) read.appendChild(el("p", { class: "lead", text: cur.one }));
      var tt = cur.terms.map(function (n) { return termByName(n) ? termChip(n) : chip(n); });
      if (tt.length) read.appendChild(el("div", { class: "rel" }, [el("span", { class: "flabel", text: "배운 용어" }), el("div", { class: "chips" }, tt)]));
      var ws = cur.works.map(workById).filter(Boolean);
      if (ws.length) read.appendChild(el("div", { class: "rel" }, [el("span", { class: "flabel", text: "만든 결과물" }), el("div", { class: "chips" }, ws.map(function (w) { return el("a", { class: "chip link", href: href(["projects", w.id]), text: w.title }); }))]));
      var body = el("div", { class: "prose" }, [el("p", { class: "sub", text: "불러오는 중입니다." })]);
      read.appendChild(body);
      fetch(cur.html).then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
        .then(function (h) { body.innerHTML = h; })
        .catch(function () { body.textContent = "노트를 불러오지 못했습니다."; });
    } else read.appendChild(empty("노트를 고르면 여기에 보입니다."));
    split.appendChild(list);
    split.appendChild(read);
    view.appendChild(split);
    view.classList.add("flush");
  }

  /* ---------- 용어 (목록 + 상세) ---------- */
  function viewTerms(name) {
    var sorted = terms.slice().sort(function (a, b) { return a.name.localeCompare(b.name, "ko"); });
    var cur = name ? termByName(name) : null;
    if (!cur && isDesktop() && sorted.length) cur = sorted[0];
    var split = el("div", { class: "split" + (cur ? " has-sel" : "") });
    var list = el("div", { class: "split-list" });
    list.appendChild(el("h1", { class: "split-h", text: "용어" }));
    list.appendChild(el("p", { class: "sub pad-s", text: terms.length + "개 · 가나다 순" }));
    sorted.forEach(function (t) {
      list.appendChild(el("a", { class: "item compact" + (cur && cur.name === t.name ? " on" : ""), href: href(["terms", t.name]) }, [
        el("h3", {}, [isNew(t.first) ? dot() : null, txt(t.name)]),
        el("p", { class: "did", text: t.def })
      ]));
    });
    var read = el("article", { class: "split-read" });
    if (cur) {
      read.appendChild(el("a", { class: "back only-m", href: href(["terms"]), text: "← 용어 목록" }));
      read.appendChild(el("p", { class: "meta", text: koDay(cur.first) + " 처음 나옴 · " + cur.notes.length + "곳에 나옴" }));
      read.appendChild(el("h1", { text: cur.name }));
      read.appendChild(el("p", { class: "lead", text: cur.def }));
      var ns = cur.notes.map(noteById).filter(Boolean).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      read.appendChild(el("section", { class: "block" }, [secHead("나온 곳"), ns.length ? el("div", { class: "card list rows" }, ns.map(noteRow)) : empty("노트가 없습니다.")]));
      var ws = cur.works.map(workById).filter(Boolean);
      if (ws.length) read.appendChild(el("section", { class: "block" }, [secHead("함께 만든 결과물"), el("div", { class: "chips wide" }, ws.map(function (w) { return el("a", { class: "chip link", href: href(["projects", w.id]), text: w.title }); }))]));
    } else read.appendChild(empty("용어를 고르면 여기에 보입니다."));
    split.appendChild(list);
    split.appendChild(read);
    view.appendChild(split);
    view.classList.add("flush");
  }

  /* ---------- 링크 모음 ---------- */
  function viewLinks() {
    var page = el("div", { class: "page" });
    page.appendChild(el("h1", { text: "링크 모음" }));
    page.appendChild(el("p", { class: "lead", text: "강사님이 \"이런 건 좋아요\" 하고 알려 준 사이트를 모아 둡니다." }));
    var sorted = links.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    page.appendChild(sorted.length ? el("div", { class: "grid3" }, sorted.map(function (l) {
      return el("a", { class: "card pad lcard", href: l.url, target: "_blank", rel: "noopener noreferrer" }, [
        el("h3", { text: l.title }),
        el("p", { class: "sub", text: host(l.url) }),
        l.note ? el("p", { class: "did", text: l.note }) : null
      ]);
    })) : empty("아직 모은 링크가 없습니다."));
    view.appendChild(page);
  }

  /* ---------- 검색 ---------- */
  function viewSearch(q) {
    var s = (q.q || "").trim().toLowerCase();
    var page = el("div", { class: "page" });
    page.appendChild(el("h1", { text: "검색" }));
    page.appendChild(el("p", { class: "lead", text: s ? "\"" + q.q + "\"" : "검색어를 입력하세요." }));
    if (!s) { view.appendChild(page); return; }
    function has() { return Array.prototype.slice.call(arguments).join(" ").toLowerCase().indexOf(s) !== -1; }
    var groups = [
      ["결과물", works.filter(function (w) { return has(w.title, w.did, w.summary, w.type); }).map(function (w) { return { t: w.title, sub: w.did, h: href(["projects", w.id]) }; })],
      ["노트", notes.filter(function (n) { return has(n.title, n.one, n.terms.join(" ")); }).map(function (n) { return { t: noteTitle(n), sub: n.one, h: href(["notes", n.id]) }; })],
      ["용어", terms.filter(function (t) { return has(t.name, t.def); }).map(function (t) { return { t: t.name, sub: t.def, h: href(["terms", t.name]) }; })],
      ["링크", links.filter(function (l) { return has(l.title, l.url, l.note || ""); }).map(function (l) { return { t: l.title, sub: host(l.url), h: l.url, ext: true }; })]
    ];
    var any = false;
    groups.forEach(function (g) {
      if (!g[1].length) return;
      any = true;
      page.appendChild(el("section", { class: "block" }, [secHead(g[0] + " " + g[1].length), el("div", { class: "card list" }, g[1].map(function (r) {
        return el("a", { class: "li", href: r.h, target: r.ext ? "_blank" : null, rel: r.ext ? "noopener noreferrer" : null }, [
          el("span", { class: "li-main" }, [el("b", { text: r.t }), r.sub ? el("span", { class: "sub", text: r.sub }) : null])
        ]);
      }))]));
    });
    if (!any) page.appendChild(empty("찾은 것이 없습니다."));
    view.appendChild(page);
  }

  /* ---------- 사이드바 ---------- */
  var MENU = [["", "홈"], ["weeks", "주차"], ["projects", "결과물"], ["notes", "노트"], ["terms", "용어"], ["links", "링크 모음"]];
  function buildSide() {
    var p = $("profile");
    p.textContent = "";
    p.appendChild(el("p", { class: "pname", text: data.site.owner }));
    p.appendChild(el("p", { class: "ptag", text: data.site.tagline }));
    var nav = $("nav");
    nav.textContent = "";
    MENU.forEach(function (m) { nav.appendChild(el("a", { class: "nav-item", href: "#/" + m[0], "data-k": m[0], text: m[1] })); });
  }
  function setActive(key) {
    Array.prototype.forEach.call($("nav").children, function (a) {
      var on = a.getAttribute("data-k") === key;
      a.classList.toggle("on", on);
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
  }

  /* ---------- render ---------- */
  var TITLES = { weeks: "주차", projects: "결과물", notes: "노트", terms: "용어", links: "링크 모음", search: "검색" };

  function render() {
    var r = parseHash();
    var p = r.path;
    var key = p[0] || "";
    if (key === "glossary") { location.replace(href(["terms"].concat(p.slice(1)))); return; }
    if (key === "lessons" || key === "calendar") { location.replace("#/weeks"); return; }
    view.textContent = "";
    view.classList.remove("flush");
    masonry.hosts = [];
    setActive(key === "search" ? "" : key);
    $("side").classList.remove("open");
    $("scrim").hidden = true;
    if (key === "weeks") viewWeeks();
    else if (key === "projects") { if (p[1]) viewWork(p[1]); else viewProjects(r.q); }
    else if (key === "notes") viewNotes(p[1]);
    else if (key === "terms") viewTerms(p[1]);
    else if (key === "links") viewLinks();
    else if (key === "search") viewSearch(r.q);
    else viewHome();
    $("main").scrollTop = 0;
    window.scrollTo(0, 0);
    document.title = (TITLES[key] ? TITLES[key] + " · " : "") + "AI PM Archive";
  }

  /* ---------- init ---------- */
  function load(url) { return fetch(url).then(function (r) { if (!r.ok) throw new Error(url + " " + r.status); return r.json(); }); }

  Promise.all([load("data/works.json"), load("data/links.json"), load("data/lessons.json"), load("data/notes.json"), load("data/terms.json")])
    .then(function (a) {
      data = a[0]; works = data.works; links = a[1].links; lessons = a[2].lessons; notes = a[3].notes; terms = a[4].terms;
      $("today").textContent = koDay(TODAY);
      buildSide();
      window.addEventListener("hashchange", render);
      render();
    })
    .catch(function (e) {
      view.textContent = "";
      view.appendChild(el("p", { class: "empty", text: "데이터를 불러오지 못했습니다. 웹 서버로 열어야 합니다. (" + e.message + ")" }));
    });

  $("menu-btn").addEventListener("click", function () { $("side").classList.add("open"); $("scrim").hidden = false; });
  $("scrim").addEventListener("click", function () { $("side").classList.remove("open"); $("scrim").hidden = true; });

  var q = $("q"), timer = null;
  q.addEventListener("input", function () {
    clearTimeout(timer);
    timer = setTimeout(function () {
      var v = q.value.trim();
      if (v) location.hash = href(["search"], { q: v });
      else if (parseHash().path[0] === "search") location.hash = "#/";
    }, 200);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "/" && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); q.focus(); }
    if (e.key === "Escape" && document.activeElement === q) q.blur();
  });
})();
