(function () {
  "use strict";

  var data = null, works = [], links = [], lessons = [], terms = [], notes = [], notesAsc = [];
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
  function currentWeek() {
    var w = data.weeks.filter(function (x) { return TODAY >= x.start && TODAY <= addDays(x.end, 2); })[0];
    return w || data.weeks[data.weeks.length - 1];
  }

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

  /* ---------- icons and line art ---------- */
  var ICONS = {
    home: "M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z",
    calendar: "M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM4 10h16M8 3v4M16 3v4",
    folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
    note: "M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7",
    term: "M4 5h7l9 9-6 6-9-9zM8.5 9.5h.01",
    link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1"
  };
  function icon(name) {
    var ns = "http://www.w3.org/2000/svg";
    var s = document.createElementNS(ns, "svg");
    s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("class", "ico"); s.setAttribute("aria-hidden", "true");
    var p = document.createElementNS(ns, "path");
    p.setAttribute("d", ICONS[name]); p.setAttribute("fill", "none"); p.setAttribute("stroke", "currentColor");
    p.setAttribute("stroke-width", "1.6"); p.setAttribute("stroke-linecap", "round"); p.setAttribute("stroke-linejoin", "round");
    s.appendChild(p);
    return s;
  }
  /* 선으로 그린 일러스트: 정해진 문자열만 넣는다 */
  var ART = {
    hero: '<svg viewBox="0 0 320 230" class="art" aria-hidden="true">' +
      '<g class="plus"><path d="M26 56v10M21 61h10"/><path d="M286 150v10M281 155h10"/><path d="M250 28v8M246 32h8"/></g>' +
      '<g class="plane"><path d="M236 52l32-14-9 30-9-11-9 6z" /><path d="M259 68l-9-11 18-19"/><path class="trail" d="M232 66c-18 4-30 2-46-6"/></g>' +
      '<g class="dashes"><path d="M52 78h22"/><path d="M60 88h14"/></g>' +
      '<rect x="92" y="62" width="148" height="122" rx="3"/>' +
      '<g class="holes"><circle cx="92" cy="84" r="3"/><circle cx="92" cy="104" r="3"/><circle cx="92" cy="124" r="3"/><circle cx="92" cy="144" r="3"/><circle cx="92" cy="164" r="3"/></g>' +
      '<rect class="strap" x="196" y="62" width="22" height="122"/>' +
      '<rect class="label" x="116" y="94" width="60" height="38"/><circle class="reddot" cx="146" cy="113" r="4.5"/>' +
      '<path d="M116 152h58M116 164h40"/>' +
      '<path class="ground" d="M60 196h210"/><circle cx="120" cy="196" r="5"/><circle cx="212" cy="196" r="5"/></svg>',
    browser: '<svg viewBox="0 0 64 44" class="art mini" aria-hidden="true"><rect x="2" y="2" width="60" height="40" rx="3"/><path d="M2 12h60"/><circle class="reddot" cx="8" cy="7" r="1.8"/><path d="M10 22h24M10 30h16"/><rect x="40" y="20" width="16" height="14" class="dashed"/></svg>'
  };
  function art(name) { var s = el("span", { class: "art-wrap" }); s.innerHTML = ART[name]; return s; }

  /* ---------- shared pieces ---------- */
  function chip(text) { return el("span", { class: "chip", text: text }); }
  function termChip(name) { return el("a", { class: "chip link", href: href(["terms", name]), text: name }); }
  function dot() { return el("span", { class: "newdot", title: "최근에 추가했습니다" }); }
  function empty(msg) { return el("p", { class: "empty", text: msg }); }
  function eyebrow(t) { return el("p", { class: "eyebrow", text: t }); }
  function pageHead(eb, title, sub) {
    return el("header", { class: "phead rise" }, [eyebrow(eb), el("h1", { text: title }), sub ? el("p", { class: "lead", text: sub }) : null]);
  }
  function secHead(label, side) {
    return el("div", { class: "sh" }, [el("b", { text: label }), side ? (typeof side === "string" ? el("span", { text: side }) : side) : null]);
  }
  function more(t, h) { return el("a", { class: "more", href: h, text: t + " →" }); }

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

  function metaLine(w) {
    return el("p", { class: "meta" }, [isNew(w.date) ? dot() : null, txt(mmdd(w.date) + " · " + weekOf(w.week).label + " · " + w.type)]);
  }

  /* 결과물 카드 */
  function workCard(w) {
    var used = termsOfWork(w.id);
    return el("a", { class: "card wcard", href: href(["projects", w.id]) }, [
      thumbBox(w),
      el("div", { class: "cbody" }, [
        metaLine(w),
        el("h3", { text: w.title }),
        el("p", { class: "did", text: w.did || "" }),
        used.length ? el("div", { class: "chips" }, used.slice(0, 4).map(function (t) { return chip(t.name); })) : null
      ])
    ]);
  }

  /* 작은 결과물 줄 (주차 화면) */
  function workMini(w) {
    return el("a", { class: "mini", href: href(["projects", w.id]) }, [
      thumbBox(w),
      el("span", { class: "mini-t" }, [el("b", { text: w.title }), el("span", { class: "meta" }, [isNew(w.date) ? dot() : null, txt(mmdd(w.date) + " · " + w.type)])])
    ]);
  }
  function noteMini(n) {
    return el("a", { class: "nmini", href: href(["notes", n.id]) }, [
      el("span", { class: "nm-d" }, [txt(mmdd(n.date))]),
      el("span", { class: "nm-t" }, [el("b", {}, [isNew(n.date) ? dot() : null, txt(noteTitle(n))]), n.one ? el("span", { class: "did", text: n.one }) : null])
    ]);
  }

  function noteRow(n) {
    return el("a", { class: "row", href: href(["notes", n.id]) }, [
      el("p", { class: "meta" }, [isNew(n.date) ? dot() : null, txt(koDay(n.date) + " · " + weekOf(n.week).label)]),
      el("h3", { text: noteTitle(n) }),
      n.one ? el("p", { class: "did", text: n.one }) : null,
      n.terms.length ? el("div", { class: "chips" }, n.terms.map(chip)) : null
    ]);
  }

  /* 벽돌 배치 */
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
    var months = el("div", { class: "g-months" });
    var grid = el("div", { class: "grass", role: "group", "aria-label": "날짜별 기록량" });
    var cells = {};
    var lastMonth = 0;
    for (var c = 0; c < COLS; c++) {
      var colStart = addDays(start, c * 7);
      var mo = parts(colStart).m;
      var nextMo = parts(addDays(colStart, 7)).m;
      months.appendChild(el("span", { text: mo !== lastMonth && !(c === 0 && nextMo !== mo) ? mo + "월" : "" }));
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
    wrap.appendChild(el("div", { class: "g-body" }, [
      el("div", { class: "g-days" }, ["월", "", "수", "", "금", "", ""].map(function (d) { return el("span", { text: d }); })),
      grid
    ]));
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
    box.appendChild(el("p", { class: "dp-h" }, [el("b", { text: koDay(date) }), el("span", { class: "sub", text: a ? "결과물 " + a.works.length + " · 노트 " + a.notes.length + " · 용어 " + a.terms.length : "기록 없음" })]));
    if (!total(a)) return box;
    var rows = [];
    a.works.forEach(function (w) { rows.push(el("a", { class: "dchip", href: href(["projects", w.id]) }, [el("em", { text: "결과물" }), txt(w.title)])); });
    a.notes.forEach(function (n) { rows.push(el("a", { class: "dchip", href: href(["notes", n.id]) }, [el("em", { text: "노트" }), txt(noteTitle(n))])); });
    a.terms.forEach(function (t) { rows.push(el("a", { class: "dchip", href: href(["terms", t.name]) }, [el("em", { text: "용어" }), txt(t.name)])); });
    box.appendChild(el("div", { class: "dchips" }, rows));
    return box;
  }

  function counts(w) {
    return {
      w: works.filter(function (x) { return x.week === w.id; }).length,
      n: notes.filter(function (x) { return x.week === w.id; }).length,
      t: terms.filter(function (x) { return x.first >= w.start && x.first <= w.end; }).length
    };
  }
  function stackBar(c, max) {
    var tot = c.w + c.n + c.t || 1;
    var bar = el("div", { class: "stack", style: "width:" + Math.max(8, Math.round((tot / max) * 100)) + "%" });
    [["w", c.w], ["n", c.n], ["t", c.t]].forEach(function (p) {
      if (p[1]) bar.appendChild(el("i", { class: "s-" + p[0], style: "flex:" + p[1], title: p[1] + "개" }));
    });
    return el("div", { class: "stack-track" }, [bar]);
  }
  function maxTotal() {
    return Math.max.apply(null, data.weeks.map(function (w) { var c = counts(w); return c.w + c.n + c.t; })) || 1;
  }
  function figs(c) {
    return el("div", { class: "figs" }, [
      el("span", {}, [el("b", { text: "" + c.w }), el("em", { text: "결과물" })]),
      el("span", {}, [el("b", { text: "" + c.n }), el("em", { text: "노트" })]),
      el("span", {}, [el("b", { text: "" + c.t }), el("em", { text: "용어" })])
    ]);
  }

  /* ---------- 홈: 한 화면 대시보드 ---------- */
  function chead(no, label, side) {
    return el("div", { class: "ch" }, [el("span", { class: "ch-l" }, [el("em", { text: no }), el("b", { text: label })]), side || null]);
  }
  function stat(n, label) {
    return el("div", { class: "stat" }, [el("b", { text: "" + n }), el("span", { text: label })]);
  }

  function viewHome() {
    var map = activity();
    var cw = currentWeek();
    var first = data.weeks[0].start;
    var page = el("div", { class: "home" });

    /* 소개 */
    page.appendChild(el("section", { class: "card hero c-lime rise" }, [
      el("span", { class: "orb pink" }), el("span", { class: "orb blue" }),
      el("div", { class: "hero-l" }, [
        chead("00", "AI PM ARCHIVE"),
        el("h1", { text: cw.label }),
        el("p", { class: "hero-sub", text: first.replace(/-/g, ".") + " — 지금 · " + (diffDays(TODAY, first) + 1) + "일째" })
      ]),
      el("div", { class: "hero-r" }, [stat(works.length, "결과물"), stat(notes.length, "노트"), stat(terms.length, "용어")])
    ]));

    /* 잔디 */
    var dates = Object.keys(map).filter(function (d) { return total(map[d]) > 0; }).sort();
    var pick = dates.filter(function (d) { return d <= TODAY; }).pop() || dates[dates.length - 1];
    var panelHost = el("div", { class: "scroll" });
    var g = grass(map, function (d) { select(d); });
    function select(d) {
      Object.keys(g._cells).forEach(function (k) { g._cells[k].classList.toggle("sel", k === d); });
      panelHost.textContent = "";
      panelHost.appendChild(dayPanel(map, d));
    }
    page.appendChild(el("section", { class: "card pad grasscard c-pink rise" }, [chead("01", "ACTIVITY", el("span", { class: "ch-r", text: "하루 기록량" })), g, panelHost]));
    if (pick) select(pick);

    /* 주차별 변화 */
    var mx = maxTotal();
    var wl = el("div", { class: "scroll wkl" });
    data.weeks.slice().reverse().forEach(function (w) {
      var c = counts(w);
      wl.appendChild(el("a", { class: "wkrow", href: href(["weeks"]) }, [
        el("div", { class: "wk-h" }, [el("b", {}, [w.id === cw.id ? dot() : null, txt(w.label)]), el("span", { class: "sub", text: w.period })]),
        figs(c),
        stackBar(c, mx)
      ]));
    });
    page.appendChild(el("section", { class: "card pad c-orange rise" }, [chead("02", "WEEKLY", more("주차 보기", href(["weeks"]))), wl]));

    /* 최근 추가 */
    var recent = [];
    works.forEach(function (w) { recent.push({ date: w.date, kind: "결과물", title: w.title, sub: w.did, href: href(["projects", w.id]) }); });
    notes.forEach(function (n) { recent.push({ date: n.date, kind: "노트", title: noteTitle(n), sub: n.one, href: href(["notes", n.id]) }); });
    recent.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
    var rl = el("div", { class: "scroll" }, recent.slice(0, 12).map(function (r) {
      return el("a", { class: "li", href: r.href }, [
        el("span", { class: "li-main" }, [el("b", {}, [isNew(r.date) ? dot() : null, txt(r.title)]), r.sub ? el("span", { class: "sub clamp1", text: r.sub }) : null]),
        el("span", { class: "li-side" }, [el("em", { text: r.kind }), el("span", { class: "sub", text: mmdd(r.date) })])
      ]);
    }));
    page.appendChild(el("section", { class: "card pad c-sky rise" }, [chead("03", "RECENT", more("결과물", href(["projects"]))), rl]));

    /* 최근 용어 */
    var rt = terms.slice().sort(function (a, b) { return a.first < b.first ? 1 : a.first > b.first ? -1 : a.name < b.name ? -1 : 1; });
    var tl = el("div", { class: "scroll" }, rt.slice(0, 14).map(function (t) {
      return el("a", { class: "li", href: href(["terms", t.name]) }, [
        el("span", { class: "li-main" }, [el("b", {}, [isNew(t.first) ? dot() : null, txt(t.name)]), el("span", { class: "sub clamp1", text: t.def })]),
        el("span", { class: "li-side" }, [strip(t, true)])
      ]);
    }));
    page.appendChild(el("section", { class: "card pad c-ink rise" }, [chead("04", "TERMS", more("용어 전체", href(["terms"]))), tl]));
    view.appendChild(page);
    view.classList.add("fit");
  }

  /* 용어가 어느 노트에 나왔는지 보여 주는 칸 줄 */
  function strip(t, small) {
    var s = el("span", { class: "strip" + (small ? " sm" : "") });
    notesAsc.forEach(function (n) {
      s.appendChild(el("i", { class: t.notes.indexOf(n.id) !== -1 ? "on" : "", title: mmdd(n.date) + " " + noteTitle(n) }));
    });
    return s;
  }

  /* ---------- 주차: 3열 타임라인 ---------- */
  function viewWeeks() {
    var page = el("div", { class: "page wide" });
    page.appendChild(pageHead("TIMELINE", "주차", "주차마다 만든 것, 쓴 노트, 처음 나온 용어를 한 줄로 이어서 봅니다."));
    var cw = currentWeek();
    var mx = maxTotal();
    var grid = el("div", { class: "wgrid" });
    data.weeks.forEach(function (w) {
      var c = counts(w);
      var col = el("section", { class: "wcol rise" });
      col.appendChild(el("div", { class: "wc-head" }, [
        el("p", { class: "eyebrow" }, [w.id === cw.id ? dot() : null, txt("WEEK " + (data.weeks.indexOf(w) + 1))]),
        el("h2", { text: w.label }),
        el("p", { class: "sub", text: w.period }),
        figs(c),
        stackBar(c, mx)
      ]));
      var ws = works.filter(function (x) { return x.week === w.id; }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
      if (ws.length) { col.appendChild(secHead("결과물", "" + ws.length)); col.appendChild(el("div", { class: "stackcol" }, ws.map(workMini))); }
      var ns = notes.filter(function (x) { return x.week === w.id; }).sort(function (a, b) { return a.date < b.date ? 1 : -1; });
      col.appendChild(secHead("노트", "" + ns.length));
      col.appendChild(ns.length ? el("div", { class: "stackcol" }, ns.map(noteMini)) : el("p", { class: "sub pale", text: "공개한 노트가 없습니다." }));
      var ts = terms.filter(function (x) { return x.first >= w.start && x.first <= w.end; });
      if (ts.length) { col.appendChild(secHead("처음 나온 용어", "" + ts.length)); col.appendChild(el("div", { class: "chips" }, ts.map(function (t) { return termChip(t.name); }))); }
      var ls = lessons.filter(function (x) { return x.week === w.id; });
      if (ls.length) {
        col.appendChild(secHead("교안", "" + ls.length));
        col.appendChild(el("ul", { class: "plain" }, ls.map(function (l) {
          return el("li", {}, [el("a", { href: l.url, target: "_blank", rel: "noopener noreferrer", text: l.title.replace(/^\d주차\s*/, "") + " ↗" })]);
        })));
      }
      grid.appendChild(col);
    });
    page.appendChild(grid);
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
    var page = el("div", { class: "page wide" });
    page.appendChild(pageHead("WORKS", "결과물", "직접 만든 프로토타입, 기획 문서, 보고서입니다."));
    var types = [];
    works.forEach(function (w) { if (types.indexOf(w.type) === -1) types.push(w.type); });
    page.appendChild(el("div", { class: "filters rise" }, [
      filterBar("주차", data.weeks.map(function (w) { return { id: w.id, t: w.label }; }), q.week || "", function (v) { return href(["projects"], { week: v, type: q.type }); }),
      filterBar("종류", types.map(function (t) { return { id: t, t: t }; }), q.type || "", function (v) { return href(["projects"], { week: q.week, type: v }); })
    ]));
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
    page.appendChild(el("header", { class: "phead rise" }, [
      el("p", { class: "eyebrow" }, [isNew(w.date) ? dot() : null, txt(mmdd(w.date) + " · " + weekOf(w.week).label.toUpperCase() + " · " + w.type)]),
      el("h1", { text: w.title }),
      el("p", { class: "lead", text: w.did || "" })
    ]));
    var btns = el("div", { class: "btns" });
    if (w.file) btns.appendChild(el("a", { class: "btn primary", href: enc(w.file), target: "_blank", rel: "noopener noreferrer", text: "열어 보기 ↗" }));
    (w.links || []).forEach(function (l) { btns.appendChild(el("a", { class: "btn", href: l.url, target: "_blank", rel: "noopener noreferrer", text: l.label + " ↗" })); });
    if (btns.childNodes.length) page.appendChild(btns);
    if (w.thumb) page.appendChild(el("div", { class: "card shot" }, [thumbBox(w)]));

    var used = termsOfWork(w.id);
    if (used.length) page.appendChild(el("section", { class: "block" }, [secHead("쓴 용어", "" + used.length), el("div", { class: "chips" }, used.map(function (t) { return termChip(t.name); }))]));
    var ns = notesOfWork(w.id);
    if (ns.length) page.appendChild(el("section", { class: "block" }, [secHead("관련 노트", "" + ns.length), el("div", { class: "stackcol" }, ns.map(noteMini))]));

    var sorted = works.slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1; });
    var i = sorted.indexOf(w);
    var nav = el("div", { class: "pn" });
    if (sorted[i - 1]) nav.appendChild(el("a", { class: "card pad pn-item", href: href(["projects", sorted[i - 1].id]) }, [el("span", { class: "eyebrow", text: "PREV" }), el("b", { text: sorted[i - 1].title })]));
    if (sorted[i + 1]) nav.appendChild(el("a", { class: "card pad pn-item next", href: href(["projects", sorted[i + 1].id]) }, [el("span", { class: "eyebrow", text: "NEXT" }), el("b", { text: sorted[i + 1].title })]));
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
    list.appendChild(el("div", { class: "split-top" }, [eyebrow("NOTES"), el("h1", { text: "노트" })]));
    if (!sorted.length) list.appendChild(empty("공개한 노트가 아직 없습니다."));
    var lastWeek = "";
    sorted.forEach(function (n) {
      if (n.week !== lastWeek) {
        lastWeek = n.week;
        list.appendChild(el("p", { class: "group", text: weekOf(n.week).label }));
      }
      var p = parts(n.date);
      list.appendChild(el("a", { class: "item" + (cur && cur.id === n.id ? " on" : ""), href: href(["notes", n.id]) }, [
        el("span", { class: "it-d" }, [el("b", { text: "" + p.d }), el("em", { text: p.m + "월 " + DOW[dowOf(n.date)] })]),
        el("span", { class: "it-t" }, [
          el("h3", {}, [isNew(n.date) ? dot() : null, txt(noteTitle(n))]),
          n.one ? el("p", { class: "did", text: n.one }) : null
        ])
      ]));
    });
    var read = el("article", { class: "split-read" });
    if (cur) {
      read.appendChild(el("a", { class: "back only-m", href: href(["notes"]), text: "← 노트 목록" }));
      read.appendChild(el("p", { class: "eyebrow", text: "NOTE · " + mmdd(cur.date) + " " + ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][dowOf(cur.date)] + " · " + weekOf(cur.week).label }));
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

  /* ---------- 용어: 타일 + 상세 ---------- */
  function viewTerms(name, q) {
    if (name) { viewTerm(name); return; }
    var page = el("div", { class: "page wide" });
    page.appendChild(pageHead("GLOSSARY", "용어", "배운 말을 내 문장으로 정리했습니다. 아래 칸은 용어가 나온 노트를 날짜순으로 표시합니다."));
    page.appendChild(el("div", { class: "filters rise" }, [
      filterBar("주차", data.weeks.map(function (w) { return { id: w.id, t: w.label }; }), q.week || "", function (v) { return href(["terms"], { week: v }); })
    ]));
    var wk = q.week ? weekOf(q.week) : null;
    var list = terms.filter(function (t) { return !wk || (t.first >= wk.start && t.first <= wk.end); })
      .sort(function (a, b) { return a.first < b.first ? 1 : a.first > b.first ? -1 : a.name.localeCompare(b.name, "ko"); });
    page.appendChild(el("p", { class: "sub count", text: list.length + "개 · 처음 나온 날 순" }));
    page.appendChild(el("div", { class: "tgrid" }, list.map(function (t, i) {
      return el("a", { class: "tile rise", style: "animation-delay:" + Math.min(i, 12) * 30 + "ms", href: href(["terms", t.name]) }, [
        el("p", { class: "t-top" }, [el("span", { class: "meta" }, [isNew(t.first) ? dot() : null, txt(mmdd(t.first))]), el("span", { class: "t-n", text: "×" + t.notes.length })]),
        el("h3", { text: t.name }),
        el("p", { class: "did", text: t.def }),
        strip(t)
      ]);
    })));
    view.appendChild(page);
  }

  function viewTerm(name) {
    var t = termByName(name);
    if (!t) { view.appendChild(el("div", { class: "page" }, [el("h1", { text: "찾을 수 없습니다" }), el("a", { class: "pill", href: href(["terms"]), text: "용어 목록" })])); return; }
    var page = el("div", { class: "page narrow" });
    page.appendChild(el("a", { class: "back", href: href(["terms"]), text: "← 용어" }));
    page.appendChild(el("header", { class: "phead rise" }, [
      el("p", { class: "eyebrow" }, [isNew(t.first) ? dot() : null, txt("FIRST SEEN " + mmdd(t.first) + " · " + t.notes.length + "개 노트에 나옴")]),
      el("h1", { class: "term-h", text: t.name }),
      el("p", { class: "lead", text: t.def })
    ]));
    /* 나온 시점 */
    var tl = el("div", { class: "tline" });
    notesAsc.forEach(function (n) {
      var on = t.notes.indexOf(n.id) !== -1;
      tl.appendChild(el(on ? "a" : "span", on ? { class: "tl on", href: href(["notes", n.id]), title: noteTitle(n) } : { class: "tl" }, [el("i"), el("em", { text: mmdd(n.date) })]));
    });
    page.appendChild(el("section", { class: "block" }, [secHead("나온 시점", "노트 " + notesAsc.length + "개 중 " + t.notes.length + "개"), tl]));
    var ns = t.notes.map(noteById).filter(Boolean).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    page.appendChild(el("section", { class: "block" }, [secHead("나온 곳", "" + ns.length), el("div", { class: "stackcol" }, ns.map(noteMini))]));
    var ws = t.works.map(workById).filter(Boolean);
    if (ws.length) page.appendChild(el("section", { class: "block" }, [secHead("함께 만든 결과물", "" + ws.length), el("div", { class: "stackcol" }, ws.map(workMini))]));
    var rel = terms.filter(function (o) { return o.name !== t.name && o.notes.some(function (id) { return t.notes.indexOf(id) !== -1; }); });
    if (rel.length) page.appendChild(el("section", { class: "block" }, [secHead("같은 노트에 나온 용어", "" + rel.length), el("div", { class: "chips" }, rel.map(function (o) { return termChip(o.name); }))]));
    view.appendChild(page);
  }

  /* ---------- 링크 모음 ---------- */
  function viewLinks() {
    var page = el("div", { class: "page wide" });
    page.appendChild(pageHead("REFERENCES", "링크 모음", "참고하려고 모아 둔 사이트입니다."));
    var sorted = links.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    page.appendChild(sorted.length ? el("div", { class: "lgrid" }, sorted.map(function (l, i) {
      return el("a", { class: "card lcard rise", style: "animation-delay:" + i * 40 + "ms", href: l.url, target: "_blank", rel: "noopener noreferrer" }, [
        el("div", { class: "lc-top" }, [art("browser"), el("span", { class: "lc-n", text: pad(i + 1) })]),
        el("h3", { text: l.title }),
        el("p", { class: "sub", text: host(l.url) }),
        l.note ? el("p", { class: "did", text: l.note }) : null,
        el("span", { class: "lc-go", text: "↗" })
      ]);
    })) : empty("아직 모은 링크가 없습니다."));
    view.appendChild(page);
  }

  /* ---------- 검색 ---------- */
  function viewSearch(q) {
    var s = (q.q || "").trim().toLowerCase();
    var page = el("div", { class: "page" });
    page.appendChild(pageHead("SEARCH", "검색", s ? "\"" + q.q + "\"" : "검색어를 입력하세요."));
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
      page.appendChild(el("section", { class: "block" }, [secHead(g[0], "" + g[1].length), el("div", { class: "plainlist" }, g[1].map(function (r) {
        return el("a", { class: "li", href: r.h, target: r.ext ? "_blank" : null, rel: r.ext ? "noopener noreferrer" : null }, [
          el("span", { class: "li-main" }, [el("b", { text: r.t }), r.sub ? el("span", { class: "sub clamp1", text: r.sub }) : null])
        ]);
      }))]));
    });
    if (!any) page.appendChild(empty("찾은 것이 없습니다."));
    view.appendChild(page);
  }

  /* ---------- 사이드바 ---------- */
  var MENU = [
    ["보관함", [["", "홈", "home"], ["weeks", "주차", "calendar"]]],
    ["기록", [["projects", "결과물", "folder"], ["notes", "노트", "note"], ["terms", "용어", "term"]]],
    ["참고", [["links", "링크 모음", "link"]]]
  ];
  function buildSide() {
    var p = $("profile");
    p.textContent = "";
    p.appendChild(el("span", { class: "avatar", text: data.site.owner.charAt(0) }));
    p.appendChild(el("span", { class: "p-t" }, [el("b", { text: data.site.owner }), el("span", { text: data.site.tagline })]));
    var nav = $("nav");
    nav.textContent = "";
    MENU.forEach(function (g) {
      nav.appendChild(el("p", { class: "nav-g", text: g[0] }));
      g[1].forEach(function (m) {
        var a = el("a", { class: "nav-item", href: "#/" + m[0], "data-k": m[0] });
        a.appendChild(icon(m[2]));
        a.appendChild(el("span", { text: m[1] }));
        nav.appendChild(a);
      });
    });
  }
  function setActive(key) {
    Array.prototype.forEach.call($("nav").querySelectorAll(".nav-item"), function (a) {
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
    view.className = "view";
    masonry.hosts = [];
    setActive(key === "search" ? "" : key);
    $("side").classList.remove("open");
    $("scrim").hidden = true;
    if (key === "weeks") viewWeeks();
    else if (key === "projects") { if (p[1]) viewWork(p[1]); else viewProjects(r.q); }
    else if (key === "notes") viewNotes(p[1]);
    else if (key === "terms") viewTerms(p[1], r.q);
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
      notesAsc = notes.slice().sort(function (x, y) { return x.date < y.date ? -1 : x.date > y.date ? 1 : 0; });
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
