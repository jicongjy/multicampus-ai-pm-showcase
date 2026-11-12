(function () {
  "use strict";

  var state = { q: "", type: "all", view: "card", linkSource: "all" };
  var data = null, works = [], links = [], terms = [], notes = [];
  var view = document.getElementById("view");

  function $(id) { return document.getElementById(id); }

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

  function enc(path) { return path.split("/").map(encodeURIComponent).join("/"); }
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function iso(y, m, d) { return y + "-" + pad(m) + "-" + pad(d); }
  var DOW = ["일", "월", "화", "수", "목", "금", "토"];
  function parts(date) { var a = date.split("-"); return { y: +a[0], m: +a[1], d: +a[2] }; }
  function dowOf(date) { var p = parts(date); return new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay(); }
  function mmdd(date) { return date.slice(5).replace("-", "."); }
  function koDay(date) { var p = parts(date); return p.m + "월 " + p.d + "일 (" + DOW[dowOf(date)] + ")"; }
  function host(url) { try { return new URL(url).hostname.replace(/^www\./, ""); } catch (e) { return url; } }

  var now = new Date();
  var TODAY = iso(now.getFullYear(), now.getMonth() + 1, now.getDate());

  function store(key, val) {
    try { if (val === undefined) return localStorage.getItem(key); localStorage.setItem(key, val); } catch (e) { return null; }
    return null;
  }

  /* ---------- icons ---------- */
  var ICONS = {
    home: "M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z",
    folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
    note: "M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7",
    link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1",
    calendar: "M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM4 10h16M8 3v4M16 3v4",
    book: "M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h10"
  };

  function icon(name) {
    var s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("class", "ico");
    s.setAttribute("aria-hidden", "true");
    var p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", ICONS[name]);
    p.setAttribute("fill", "none");
    p.setAttribute("stroke", "currentColor");
    p.setAttribute("stroke-width", "1.8");
    p.setAttribute("stroke-linecap", "round");
    p.setAttribute("stroke-linejoin", "round");
    s.appendChild(p);
    return s;
  }

  /* ---------- data helpers ---------- */
  function weekIndex(id) {
    for (var i = 0; i < data.weeks.length; i++) if (data.weeks[i].id === id) return i;
    return 0;
  }
  function weekOf(id) { return data.weeks[weekIndex(id)]; }
  function wcls(id) { return "w" + ((weekIndex(id) % 3) + 1); }
  function wcolor(id) { return "var(--w" + ((weekIndex(id) % 3) + 1) + ")"; }
  function byId(id) { return works.filter(function (w) { return w.id === id; })[0]; }
  function newest(list) { return list.slice().sort(function (a, b) { return a.no < b.no ? 1 : -1; }); }

  /* ---------- hash routing ---------- */
  function parseHash() {
    var h = location.hash.replace(/^#/, "");
    if (h && h.charAt(0) !== "/") return { path: ["projects", h], q: {}, legacy: true };
    var qi = h.indexOf("?");
    var pathStr = qi === -1 ? h : h.slice(0, qi);
    var q = {};
    if (qi !== -1) h.slice(qi + 1).split("&").forEach(function (kv) {
      var p = kv.split("=");
      if (p[0]) q[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || "");
    });
    var path = pathStr.split("/").filter(Boolean).map(decodeURIComponent);
    return { path: path, q: q };
  }

  function href(path, q) {
    var s = "#/" + path.map(encodeURIComponent).join("/");
    var ks = Object.keys(q || {}).filter(function (k) { return q[k] !== "" && q[k] !== undefined; });
    if (ks.length) s += "?" + ks.map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(q[k]); }).join("&");
    return s;
  }

  /* ---------- shared pieces ---------- */
  function wtag(w) {
    return el("span", { class: "wtag " + wcls(w.week), text: weekOf(w.week).label });
  }

  function thumbBox(w, withTag) {
    var box = el("div", { class: "thumb" });
    if (w.thumb) {
      var img = el("img", { src: enc(w.thumb), alt: "", loading: "lazy", decoding: "async" });
      img.addEventListener("error", function () {
        box.textContent = "";
        box.appendChild(el("div", { class: "ph", text: w.title.charAt(0) }));
        if (withTag) box.appendChild(wtag(w));
      });
      box.appendChild(img);
    } else {
      box.appendChild(el("div", { class: "ph", text: w.title.charAt(0) }));
    }
    if (withTag) box.appendChild(wtag(w));
    return box;
  }

  function pcard(w) {
    return el("a", { class: "card pcard", href: href(["projects", w.id]), "aria-label": w.title }, [
      thumbBox(w, true),
      el("div", { class: "pbody" }, [
        el("h3", { text: w.title }),
        el("div", { class: "pmeta" }, [
          el("span", { class: "no", text: "No." + pad(w.no) }),
          el("span", { text: mmdd(w.date) }),
          el("span", { class: "tag", text: w.type })
        ])
      ])
    ]);
  }

  function prow(w) {
    return el("a", { class: "card row", href: href(["projects", w.id]) }, [
      thumbBox(w, false),
      el("div", {}, [
        el("h3", { text: w.title }),
        el("div", { class: "pmeta" }, [
          el("span", { class: "no", text: "No." + pad(w.no) }),
          el("span", { text: mmdd(w.date) }),
          el("span", { text: w.type })
        ])
      ]),
      wtag(w)
    ]);
  }

  function lcard(l) {
    return el("a", { class: "card lcard", href: l.url, target: "_blank", rel: "noopener noreferrer" }, [
      el("div", { class: "src" }, [
        el("span", { class: "srcdot", style: "background:" + srcColor(l.source) }),
        el("span", { text: l.source + (l.date ? " / " + mmdd(l.date) : "") })
      ]),
      el("h3", { text: l.title }),
      el("div", { class: "host", text: host(l.url) }),
      el("span", { class: "go", text: "열기 ↗" })
    ]);
  }

  function srcColor(s) {
    var order = [];
    links.forEach(function (l) { if (order.indexOf(l.source) === -1) order.push(l.source); });
    var cols = ["var(--teal)", "var(--ochre)", "var(--clay)", "var(--sage)"];
    return cols[order.indexOf(s) % cols.length] || cols[0];
  }

  function tcard(t) {
    var rel = el("div", { class: "rel" });
    (t.works || []).forEach(function (id) {
      var w = byId(id);
      if (w) rel.appendChild(el("a", { href: href(["projects", id]), text: w.title }));
    });
    return el("article", { class: "card tcard" }, [
      el("h3", { text: t.term }),
      t.full ? el("div", { class: "full", text: t.full }) : null,
      el("p", { text: t.def }),
      rel.childNodes.length ? rel : null
    ]);
  }

  function ncard(n) {
    var inner = [
      el("div", { class: "src" }, [el("span", { text: (n.week ? weekOf(n.week).label : "") + (n.date ? " / " + mmdd(n.date) : "") })]),
      el("h3", { text: n.title })
    ];
    if (n.summary) inner.push(el("div", { class: "host", text: n.summary }));
    return n.file
      ? el("a", { class: "card lcard", href: enc(n.file), target: "_blank", rel: "noopener" }, inner)
      : el("div", { class: "card lcard" }, inner);
  }

  function empty(title, text) {
    return el("div", { class: "card empty" }, [el("strong", { text: title }), el("p", { text: text })]);
  }

  function head(title, sub, right) {
    return el("div", { class: "head" }, [
      el("div", {}, [el("h1", { text: title }), sub ? el("p", { text: sub }) : null]),
      right || null
    ]);
  }

  function segOf(items, current, onPick, cls) {
    var box = el("div", { class: "seg" + (cls ? " " + cls : ""), role: "group" });
    items.forEach(function (it) {
      var b = el("button", { type: "button", text: it.label, "aria-pressed": String(current === it.value) });
      b.addEventListener("click", function () { onPick(it.value); });
      box.appendChild(b);
    });
    return box;
  }

  /* ---------- month grid ---------- */
  function monthCells(y, m) {
    var first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    var days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    var prevDays = new Date(Date.UTC(y, m - 1, 0)).getUTCDate();
    var cells = [];
    for (var i = 0; i < first; i++) {
      var pm = m === 1 ? 12 : m - 1, py = m === 1 ? y - 1 : y;
      cells.push({ date: iso(py, pm, prevDays - first + 1 + i), d: prevDays - first + 1 + i, off: true });
    }
    for (var d = 1; d <= days; d++) cells.push({ date: iso(y, m, d), d: d, off: false });
    var nm = m === 12 ? 1 : m + 1, ny = m === 12 ? y + 1 : y;
    for (var k = 1; cells.length % 7 !== 0; k++) cells.push({ date: iso(ny, nm, k), d: k, off: true });
    return cells;
  }

  function worksOn(date) { return works.filter(function (w) { return w.date === date; }); }

  /* ---------- views ---------- */
  function viewHome() {
    var frag = document.createDocumentFragment();
    var days = {};
    works.forEach(function (w) { days[w.date] = true; });
    var max = 1;
    data.weeks.forEach(function (wk) {
      max = Math.max(max, works.filter(function (w) { return w.week === wk.id; }).length);
    });

    var main = el("div", {}, []);
    main.appendChild(el("div", { class: "hello" }, [
      el("h1", { text: "안녕하세요, " + data.site.owner + "님" }),
      el("p", { text: data.site.subtitle })
    ]));

    var stats = el("div", { class: "stats" });
    var perWeek = data.weeks.map(function (w) { return works.filter(function (x) { return x.week === w.id; }).length; });
    var seg = el("div", { class: "meter" });
    data.weeks.forEach(function (w, i) { seg.appendChild(el("i", { class: wcls(w.id), style: "flex:" + perWeek[i] })); });
    function stat(cls, mark, label, val, unit, extra) {
      return el("div", { class: "card stat " + cls }, [
        el("header", {}, [el("span", { class: "sq", text: mark }), el("span", { text: label })]),
        el("div", { class: "val" }, [el("strong", { text: String(val) }), el("small", { text: unit })]),
        extra
      ]);
    }
    var first = data.weeks[0].start, last = data.weeks[data.weeks.length - 1].end;
    var span = el("div", { class: "meter base" }, [el("i", { class: "w2", style: "width:100%" })]);
    var dayBar = el("div", { class: "meter base" }, [el("i", { class: "w3", style: "width:" + Math.round(Object.keys(days).length / 12 * 100) + "%" })]);
    stats.appendChild(stat("w1", "P", "프로젝트", works.length, "개", seg));
    stats.appendChild(stat("w2", "W", "학습 주차", data.weeks.length, mmdd(first) + " ~ " + mmdd(last), span));
    stats.appendChild(stat("w3", "D", "결과물을 만든 날", Object.keys(days).length, "일", dayBar));
    main.appendChild(stats);

    main.appendChild(el("div", { class: "section" }, [el("h2", { text: "주차별 진행" })]));
    var wk = el("div", { class: "weeks" });
    data.weeks.forEach(function (w) {
      var items = works.filter(function (x) { return x.week === w.id; });
      var ul = el("ul");
      items.slice(0, 3).forEach(function (x) { ul.appendChild(el("li", { text: x.title })); });
      if (items.length > 3) ul.appendChild(el("li", { text: "외 " + (items.length - 3) + "개" }));
      var bar = el("div", { class: "meter base" }, [el("i", { class: wcls(w.id), style: "width:" + Math.round(items.length / max * 100) + "%" })]);
      wk.appendChild(el("a", { class: "card wcard " + wcls(w.id), href: href(["projects"], { week: w.id }) }, [
        el("header", {}, [el("span", { class: "sq", text: String(weekIndex(w.id) + 1) }), el("h3", { text: w.label }), el("span", { text: w.period })]),
        ul,
        bar,
        el("footer", {}, [el("span", { text: "프로젝트 " + items.length + "개" }), el("span", { text: "보기 →" })])
      ]));
    });
    main.appendChild(wk);

    main.appendChild(el("div", { class: "section" }, [
      el("h2", { text: "최근 결과물" }),
      el("a", { href: href(["projects"]), text: "전체 보기" })
    ]));
    var cards = el("div", { class: "cards" });
    newest(works).slice(0, 4).forEach(function (w) { cards.appendChild(pcard(w)); });
    main.appendChild(cards);

    /* aside */
    var aside = el("div", { class: "aside" });
    var cur = parts(TODAY);
    var cal = el("section", { class: "card panel" });
    cal.appendChild(el("div", { class: "section" }, [
      el("h2", { text: cur.y + "년 " + cur.m + "월" }),
      el("a", { href: href(["calendar"]), text: "캘린더" })
    ]));
    var table = el("table", { class: "mini" });
    var tr = el("tr");
    DOW.forEach(function (d) { tr.appendChild(el("th", { text: d })); });
    table.appendChild(el("thead", {}, [tr]));
    var tb = el("tbody");
    var cells = monthCells(cur.y, cur.m);
    for (var r = 0; r < cells.length; r += 7) {
      var row = el("tr");
      cells.slice(r, r + 7).forEach(function (c) {
        var td = el("td", { class: (c.off ? "off " : "") + (c.date === TODAY ? "today" : "") });
        td.appendChild(el("span", { text: String(c.d) }));
        var on = worksOn(c.date);
        if (on.length && !c.off) {
          var pip = el("div", { class: "pip" });
          on.slice(0, 3).forEach(function (w) { pip.appendChild(el("i", { style: "background:" + wcolor(w.week) })); });
          td.appendChild(pip);
          td.appendChild(el("a", { href: href(["calendar"], { m: c.date.slice(0, 7) }), "aria-label": koDay(c.date) }));
        }
        row.appendChild(td);
      });
      tb.appendChild(row);
    }
    table.appendChild(tb);
    cal.appendChild(table);
    aside.appendChild(cal);

    var lp = el("section", { class: "card panel" });
    lp.appendChild(el("div", { class: "section" }, [el("h2", { text: "링크 모음" }), el("a", { href: href(["links"]), text: "전체" })]));
    if (links.length) links.slice(0, 4).forEach(function (l) {
      lp.appendChild(el("a", { class: "lrow", href: l.url, target: "_blank", rel: "noopener noreferrer" }, [
        el("span", { class: "srcdot", style: "background:" + srcColor(l.source) }),
        el("b", { text: l.title }),
        el("small", { text: host(l.url) })
      ]));
    });
    else lp.appendChild(el("p", { class: "count", text: "저장한 링크가 없습니다." }));
    aside.appendChild(lp);

    var tp = el("section", { class: "card panel" });
    tp.appendChild(el("div", { class: "section" }, [el("h2", { text: "용어" }), el("a", { href: href(["glossary"]), text: "전체" })]));
    terms.slice(0, 4).forEach(function (t) {
      tp.appendChild(el("a", { class: "lrow", href: href(["glossary"]) }, [el("b", { text: t.term }), el("small", { text: t.full || "" })]));
    });
    aside.appendChild(tp);

    frag.appendChild(el("div", { class: "home" }, [main, aside]));
    return frag;
  }

  function viewProjects(q) {
    var frag = document.createDocumentFragment();
    var week = q.week || "all";
    var types = [];
    works.forEach(function (w) { if (types.indexOf(w.type) === -1) types.push(w.type); });
    var list = works.filter(function (w) {
      return (week === "all" || w.week === week) && (state.type === "all" || w.type === state.type);
    });
    list = newest(list).reverse();

    frag.appendChild(head("프로젝트", "수업에서 만든 기획 문서와 프로토타입을 모아 둔 곳입니다."));

    var weekItems = [{ label: "전체", value: "all" }].concat(data.weeks.map(function (w) { return { label: w.label, value: w.id }; }));
    var bar = el("div", { class: "bar" });
    bar.appendChild(segOf(weekItems, week, function (v) { location.hash = href(["projects"], { week: v === "all" ? "" : v }); }));

    var chips = el("div", { class: "chips", role: "group", "aria-label": "종류" });
    [{ label: "모든 종류", value: "all" }].concat(types.map(function (t) { return { label: t, value: t }; })).forEach(function (it) {
      var b = el("button", { type: "button", class: "chip", text: it.label, "aria-pressed": String(state.type === it.value) });
      b.addEventListener("click", function () { state.type = it.value; render(); });
      chips.appendChild(b);
    });
    bar.appendChild(chips);

    bar.appendChild(el("div", { class: "grow" }, [
      el("p", { class: "count", text: list.length + " / " + works.length }),
      segOf([{ label: "카드", value: "card" }, { label: "목록", value: "list" }], state.view, function (v) { state.view = v; render(); })
    ]));
    frag.appendChild(bar);

    if (!list.length) {
      frag.appendChild(empty("조건에 맞는 프로젝트가 없습니다", "주차나 종류 필터를 바꿔 보세요."));
    } else if (state.view === "list") {
      var rows = el("div", { class: "rows" });
      list.forEach(function (w) { rows.appendChild(prow(w)); });
      frag.appendChild(rows);
    } else {
      var cards = el("div", { class: "cards" });
      list.forEach(function (w) { cards.appendChild(pcard(w)); });
      frag.appendChild(cards);
    }
    return frag;
  }

  function stageFor(w) {
    var stage = el("div", { class: "card stage" });
    function ext(p) { var m = /\.([a-z0-9]+)$/i.exec(p || ""); return m ? m[1].toLowerCase() : ""; }
    if (w.file) {
      var e = ext(w.file), url = enc(w.file);
      if (e === "png" || e === "jpg" || e === "jpeg" || e === "webp") {
        stage.appendChild(el("div", { class: "scroll" }, [el("img", { src: url, alt: w.title })]));
      } else {
        var wait = el("span", { class: "wait", text: "불러오는 중" });
        var frame = el("iframe", { src: url, title: w.title, sandbox: "allow-scripts allow-same-origin allow-forms allow-popups allow-modals" });
        frame.addEventListener("load", function () { if (wait.parentNode) wait.parentNode.removeChild(wait); });
        stage.appendChild(wait);
        stage.appendChild(frame);
      }
    } else {
      var note = el("div", { class: "note" });
      if (w.thumb) note.appendChild(el("img", { src: enc(w.thumb), alt: "" }));
      note.appendChild(el("p", { text: "이 프로젝트는 외부 주소에서 열립니다. 왼쪽의 버튼으로 이동하세요." }));
      stage.appendChild(note);
    }
    return stage;
  }

  function viewDetail(id) {
    var w = byId(id);
    if (!w) return empty("찾을 수 없는 프로젝트입니다", "목록으로 돌아가 다시 선택해 주세요.");
    var frag = document.createDocumentFragment();
    var order = works.slice();
    var idx = order.indexOf(w);
    frag.appendChild(el("a", { class: "back", href: href(["projects"], { week: w.week }), text: "← 프로젝트 목록" }));

    var actions = el("div", { class: "actions" });
    if (w.file) actions.appendChild(el("a", { class: "btn", href: enc(w.file), target: "_blank", rel: "noopener", text: "새 창에서 열기 ↗" }));
    (w.links || []).forEach(function (l, i) {
      actions.appendChild(el("a", { class: "btn" + (w.file || i > 0 ? " ghost" : ""), href: l.url, target: "_blank", rel: "noopener noreferrer", text: l.label + " ↗" }));
    });

    var prev = idx > 0 ? order[idx - 1] : null, next = idx < order.length - 1 ? order[idx + 1] : null;
    function navBtn(label, target) {
      return target ? el("a", { class: "btn ghost", href: href(["projects", target.id]), text: label }) : el("span", { class: "btn ghost", style: "opacity:.35", text: label });
    }

    var related = glossaryFor(w.id);
    var info = el("aside", { class: "card dinfo" }, [
      el("div", { class: "meta" }, [wtag(w), el("span", { text: w.date + " / " + w.type })]),
      el("h1", { text: w.title }),
      w.summary ? el("p", { class: "sum", text: w.summary }) : null,
      actions,
      related.length ? el("div", { class: "tcard", style: "padding:0" }, [
        el("div", { class: "full", text: "관련 용어" }),
        el("div", { class: "rel" }, related.map(function (t) { return el("a", { href: href(["glossary"]), text: t.term }); }))
      ]) : null,
      el("div", { class: "dnav" }, [navBtn("← 이전", prev), el("span", { class: "pos", text: (idx + 1) + " / " + order.length }), navBtn("다음 →", next)])
    ]);
    frag.appendChild(el("div", { class: "detail" }, [info, stageFor(w)]));
    return frag;
  }

  function glossaryFor(id) {
    return terms.filter(function (t) { return (t.works || []).indexOf(id) !== -1; });
  }

  function viewCalendar(q) {
    var frag = document.createDocumentFragment();
    var mode = q.v === "timeline" ? "timeline" : "month";
    var dates = works.map(function (w) { return w.date; }).sort();
    var minM = dates[0].slice(0, 7), maxM = dates[dates.length - 1].slice(0, 7);
    var curM = TODAY.slice(0, 7);
    var m = q.m || (curM >= minM && curM <= maxM ? curM : maxM);
    if (m < minM) m = minM;
    if (m > maxM) m = maxM;

    var toggle = segOf([{ label: "월간", value: "month" }, { label: "타임라인", value: "timeline" }], mode, function (v) {
      location.hash = href(["calendar"], { v: v === "month" ? "" : v, m: v === "month" ? m : "" });
    });
    frag.appendChild(head("캘린더", "결과물을 만든 날짜를 달력과 타임라인으로 봅니다.", toggle));

    if (mode === "timeline") {
      var byDate = {};
      works.forEach(function (w) { (byDate[w.date] = byDate[w.date] || []).push(w); });
      var ul = el("ul", { class: "tl" });
      Object.keys(byDate).sort().reverse().forEach(function (d) {
        ul.appendChild(el("li", { class: "d" }, [document.createTextNode(koDay(d)), el("small", { text: d })]));
        byDate[d].forEach(function (w) {
          var li = el("li", { class: "i", style: "--c:" + wcolor(w.week) });
          li.appendChild(el("a", { href: href(["projects", w.id]) }, [document.createTextNode(w.title), el("small", { text: weekOf(w.week).label + " / " + w.type })]));
          ul.appendChild(li);
        });
      });
      frag.appendChild(el("div", { class: "card cal" }, [ul]));
      return frag;
    }

    var p = m.split("-"), y = +p[0], mo = +p[1];
    function shift(n) {
      var t = new Date(Date.UTC(y, mo - 1 + n, 1));
      return t.getUTCFullYear() + "-" + pad(t.getUTCMonth() + 1);
    }
    var prevB = el("a", { class: "icon-btn", href: href(["calendar"], { m: shift(-1) }), "aria-label": "이전 달", text: "‹" });
    var nextB = el("a", { class: "icon-btn", href: href(["calendar"], { m: shift(1) }), "aria-label": "다음 달", text: "›" });
    if (shift(-1) < minM) prevB.setAttribute("style", "opacity:.3;pointer-events:none");
    if (shift(1) > maxM) nextB.setAttribute("style", "opacity:.3;pointer-events:none");
    var cal = el("div", { class: "card cal" }, [
      el("div", { class: "calhead" }, [el("h2", { text: y + "년 " + mo + "월" }), el("div", { class: "calnav" }, [prevB, nextB])])
    ]);
    var grid = el("div", { class: "grid7" });
    DOW.forEach(function (d) { grid.appendChild(el("div", { class: "dow", text: d })); });
    monthCells(y, mo).forEach(function (c) {
      var cell = el("div", { class: "day" + (c.off ? " off" : "") + (c.date === TODAY ? " today" : "") }, [el("span", { class: "dn", text: String(c.d) })]);
      worksOn(c.date).forEach(function (w) {
        cell.appendChild(el("a", { class: "ev " + wcls(w.week), href: href(["projects", w.id]), title: w.title, text: w.title }));
      });
      grid.appendChild(cell);
    });
    cal.appendChild(grid);
    frag.appendChild(cal);
    return frag;
  }

  function viewLinks() {
    var frag = document.createDocumentFragment();
    frag.appendChild(head("링크 모음", "수업과 실습에서 쓴 서비스와 참고 링크입니다."));
    if (!links.length) {
      frag.appendChild(empty("저장한 링크가 없습니다", "data/links.json에 항목을 추가하면 이곳에 카드로 나타납니다."));
      return frag;
    }
    var sources = [];
    links.forEach(function (l) { if (sources.indexOf(l.source) === -1) sources.push(l.source); });
    var chips = el("div", { class: "chips bar", role: "group", "aria-label": "출처" });
    [{ label: "전체", value: "all" }].concat(sources.map(function (s) { return { label: s, value: s }; })).forEach(function (it) {
      var b = el("button", { type: "button", class: "chip", text: it.label, "aria-pressed": String(state.linkSource === it.value) });
      b.addEventListener("click", function () { state.linkSource = it.value; render(); });
      chips.appendChild(b);
    });
    frag.appendChild(chips);
    var cards = el("div", { class: "cards" });
    links.filter(function (l) { return state.linkSource === "all" || l.source === state.linkSource; }).forEach(function (l) { cards.appendChild(lcard(l)); });
    frag.appendChild(cards);
    return frag;
  }

  function viewGlossary() {
    var frag = document.createDocumentFragment();
    frag.appendChild(head("용어", "수업에서 자주 쓰는 PM 용어를 짧게 정리했습니다."));
    if (!terms.length) {
      frag.appendChild(empty("등록한 용어가 없습니다", "data/glossary.json에 항목을 추가해 주세요."));
      return frag;
    }
    var cards = el("div", { class: "cards" });
    terms.slice().sort(function (a, b) { return a.term.localeCompare(b.term, "ko"); }).forEach(function (t) { cards.appendChild(tcard(t)); });
    frag.appendChild(cards);
    return frag;
  }

  function viewNotes() {
    var frag = document.createDocumentFragment();
    frag.appendChild(head("노트", "공개로 정리한 학습 노트를 모아 보여 줍니다."));
    if (!notes.length) {
      frag.appendChild(empty("공개한 노트가 아직 없습니다", "공개 표시한 노트를 정리해서 옮기면 이곳에 나타납니다."));
      return frag;
    }
    var cards = el("div", { class: "cards" });
    notes.forEach(function (n) { cards.appendChild(ncard(n)); });
    frag.appendChild(cards);
    return frag;
  }

  function viewSearch(qs) {
    var frag = document.createDocumentFragment();
    var terms_ = qs.toLowerCase().split(/\s+/).filter(Boolean);
    function hit(arr) { var h = arr.join(" ").toLowerCase(); return terms_.every(function (t) { return h.indexOf(t) !== -1; }); }

    var w = works.filter(function (x) { return hit([x.title, x.summary, x.type, x.date, mmdd(x.date), weekOf(x.week).label]); });
    var l = links.filter(function (x) { return hit([x.title, x.url, x.source].concat(x.tags || [])); });
    var t = terms.filter(function (x) { return hit([x.term, x.full || "", x.def]); });
    var n = notes.filter(function (x) { return hit([x.title, x.summary || ""]); });

    frag.appendChild(head("검색 결과", "\"" + qs + "\" " + (w.length + l.length + t.length + n.length) + "건"));
    if (!(w.length + l.length + t.length + n.length)) {
      frag.appendChild(empty("찾는 항목이 없습니다", "다른 검색어로 다시 찾아 보세요."));
      return frag;
    }
    function group(title, items, fn) {
      if (!items.length) return;
      var cards = el("div", { class: "cards" });
      items.forEach(function (i) { cards.appendChild(fn(i)); });
      frag.appendChild(el("section", { class: "group" }, [el("h2", { text: title + " " + items.length }), cards]));
    }
    group("프로젝트", w, pcard);
    group("링크", l, lcard);
    group("용어", t, tcard);
    group("노트", n, ncard);
    return frag;
  }

  /* ---------- sidebar ---------- */
  function buildSide(active) {
    var p = $("profile");
    p.textContent = "";
    p.appendChild(el("span", { class: "avatar", text: data.site.owner.charAt(0) }));
    p.appendChild(el("div", {}, [el("strong", { text: data.site.owner }), el("span", { text: data.site.tagline || "" })]));

    var items = [
      ["home", "홈", href([]), "", null],
      ["folder", "프로젝트", href(["projects"]), "projects", works.length],
      ["note", "노트", href(["notes"]), "notes", notes.length],
      ["link", "링크 모음", href(["links"]), "links", links.length],
      ["calendar", "캘린더", href(["calendar"]), "calendar", null],
      ["book", "용어", href(["glossary"]), "glossary", terms.length]
    ];
    var nav = $("nav");
    nav.textContent = "";
    items.forEach(function (it) {
      var a = el("a", { href: it[2] }, [icon(it[0]), el("span", { text: it[1] })]);
      if (it[4] !== null) a.appendChild(el("span", { class: "badge", text: String(it[4]) }));
      if ((it[3] || "") === active.top) a.setAttribute("aria-current", "page");
      nav.appendChild(a);
    });

    var wn = $("weeknav");
    wn.textContent = "";
    data.weeks.forEach(function (w) {
      var n = works.filter(function (x) { return x.week === w.id; }).length;
      var a = el("a", { href: href(["projects"], { week: w.id }) }, [
        el("span", { class: "dot " + wcls(w.id) }),
        el("span", { text: w.label }),
        el("span", { class: "badge", text: String(n) })
      ]);
      if (active.top === "projects" && active.week === w.id) a.setAttribute("aria-current", "page");
      wn.appendChild(a);
    });

    var rc = $("recent");
    rc.textContent = "";
    newest(works).slice(0, 3).forEach(function (w) {
      rc.appendChild(el("a", { href: href(["projects", w.id]) }, [el("span", { text: w.title })]));
    });
  }

  /* ---------- render ---------- */
  function closeDrawer() {
    $("side").classList.remove("open");
    $("scrim").hidden = true;
  }

  function render() {
    var r = parseHash();
    var top = r.path[0] || "";
    var node, active = { top: top, week: r.q.week || "" };

    if (r.legacy) {
      location.replace(href(["projects", r.path[1]]));
      return;
    }

    if (state.q) { node = viewSearch(state.q); active.top = "search"; }
    else if (top === "") node = viewHome();
    else if (top === "projects") node = r.path[1] ? viewDetail(r.path[1]) : viewProjects(r.q);
    else if (top === "notes") node = viewNotes();
    else if (top === "links") node = viewLinks();
    else if (top === "calendar") node = viewCalendar(r.q);
    else if (top === "glossary") node = viewGlossary();
    else node = empty("없는 페이지입니다", "왼쪽 메뉴에서 다시 선택해 주세요.");

    if (top === "projects" && r.path[1]) active.week = "";
    view.textContent = "";
    view.appendChild(node);
    buildSide(active);
    var t = { "": "홈", projects: "프로젝트", notes: "노트", links: "링크 모음", calendar: "캘린더", glossary: "용어" }[top];
    document.title = (t && top ? t + " | " : "") + data.site.title;
  }

  var lastHash = null;
  window.addEventListener("hashchange", function () {
    if (state.q) { state.q = ""; $("q").value = ""; }
    closeDrawer();
    render();
    if (location.hash !== lastHash) window.scrollTo(0, 0);
    lastHash = location.hash;
  });

  /* ---------- chrome events ---------- */
  $("menu-btn").addEventListener("click", function () {
    $("side").classList.add("open");
    $("scrim").hidden = false;
  });
  $("scrim").addEventListener("click", closeDrawer);

  $("q").addEventListener("input", function (e) {
    state.q = e.target.value.trim();
    render();
  });

  document.addEventListener("keydown", function (e) {
    var tag = document.activeElement && document.activeElement.tagName;
    var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(tag);
    if (e.key === "Escape") {
      if ($("side").classList.contains("open")) closeDrawer();
      else if (typing) { if (state.q) { $("q").value = ""; state.q = ""; render(); } document.activeElement.blur(); }
      return;
    }
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "/") { e.preventDefault(); $("q").focus(); return; }
    var r = parseHash();
    if (r.path[0] === "projects" && r.path[1] && !state.q) {
      var i = works.map(function (w) { return w.id; }).indexOf(r.path[1]);
      if (e.key === "ArrowLeft" && i > 0) location.hash = href(["projects", works[i - 1].id]);
      if (e.key === "ArrowRight" && i >= 0 && i < works.length - 1) location.hash = href(["projects", works[i + 1].id]);
    }
  });

  /* ---------- init ---------- */
  function getJson(url, fallback) {
    return fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).catch(function () { return fallback; });
  }

  Promise.all([
    fetch("data/works.json").then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }),
    getJson("data/links.json", { links: [] }),
    getJson("data/glossary.json", { terms: [] }),
    getJson("data/notes.json", { notes: [] })
  ]).then(function (res) {
    data = res[0];
    works = data.works.slice().sort(function (a, b) {
      return a.date === b.date ? (a.id < b.id ? -1 : 1) : a.date < b.date ? -1 : 1;
    }).map(function (w, i) { w.no = i + 1; return w; });
    function safe(u) {
      try { return /^https?:$/.test(new URL(u).protocol); } catch (e) { return false; }
    }
    function local(p) {
      return typeof p === "string" && p && !/^[a-z][a-z0-9+.-]*:/i.test(p) && p.charAt(0) !== "/" && p.indexOf("\\") === -1 && p.split("/").indexOf("..") === -1;
    }
    works.forEach(function (w) {
      if (w.file && !local(w.file)) w.file = "";
      if (w.thumb && !local(w.thumb)) w.thumb = "";
    });
    (res[3].notes || []).forEach(function (n) { if (n.file && !local(n.file)) n.file = ""; });
    works.forEach(function (w) { w.links = (w.links || []).filter(function (l) { return safe(l.url); }); });
    links = (res[1].links || []).filter(function (l) { return safe(l.url); });
    terms = res[2].terms || [];
    notes = res[3].notes || [];
    var d = parts(TODAY);
    $("today").textContent = d.y + "." + pad(d.m) + "." + pad(d.d) + " " + DOW[dowOf(TODAY)];
    lastHash = location.hash;
    render();
  }).catch(function () {
    view.textContent = "목록을 불러오지 못했습니다. 웹 서버로 열어 주세요.";
  });
})();
