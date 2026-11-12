(function () {
  "use strict";

  var state = { data: null, type: "전체" };

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) {
      if (key === "text") node.textContent = attrs[key];
      else node.setAttribute(key, attrs[key]);
    });
    (children || []).forEach(function (child) { node.appendChild(child); });
    return node;
  }

  function encodePath(path) {
    return path.split("/").map(encodeURIComponent).join("/");
  }

  function buildFilters() {
    var box = document.getElementById("filters");
    box.textContent = "";
    var types = ["전체"];
    state.data.works.forEach(function (work) {
      if (types.indexOf(work.type) === -1) types.push(work.type);
    });
    types.forEach(function (type) {
      var chip = el("button", { type: "button", class: "chip", text: type, "aria-pressed": String(type === state.type) });
      chip.addEventListener("click", function () {
        state.type = type;
        buildFilters();
        render();
      });
      box.appendChild(chip);
    });
  }

  function buildCard(work) {
    var actions = el("div", { class: "actions" });
    if (work.file) {
      actions.appendChild(el("a", { class: "btn", href: encodePath(work.file), target: "_blank", rel: "noopener", text: "열어 보기" }));
    }
    (work.links || []).forEach(function (link, index) {
      var cls = work.file || index > 0 ? "btn ghost" : "btn";
      actions.appendChild(el("a", { class: cls, href: link.url, target: "_blank", rel: "noopener noreferrer", text: link.label }));
    });

    var children = [
      el("div", { class: "card-top" }, [
        el("span", { class: "tag", text: work.type }),
        el("span", { text: work.date })
      ]),
      el("h3", { text: work.title })
    ];
    if (work.summary) children.push(el("p", { text: work.summary }));
    else children.push(el("p", { text: "" }));
    children.push(actions);
    return el("article", { class: "card" }, children);
  }

  function render() {
    var root = document.getElementById("timeline");
    root.textContent = "";
    var shown = 0;

    state.data.weeks.forEach(function (week) {
      var works = state.data.works
        .filter(function (work) {
          return work.week === week.id && (state.type === "전체" || work.type === state.type);
        })
        .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
      if (!works.length) return;
      shown += works.length;

      var grid = el("div", { class: "grid" });
      works.forEach(function (work) { grid.appendChild(buildCard(work)); });

      root.appendChild(el("section", { class: "week", id: week.id }, [
        el("div", { class: "week-head" }, [
          el("h2", { text: week.label }),
          el("span", { text: week.period + " / " + works.length + "개" })
        ]),
        grid
      ]));
    });

    if (!shown) root.appendChild(el("p", { class: "empty", text: "해당하는 결과물이 없습니다." }));
  }

  function init(data) {
    state.data = data;
    document.getElementById("site-title").textContent = data.site.title;
    document.getElementById("site-subtitle").textContent = data.site.subtitle;
    document.getElementById("site-count").textContent = "결과물 " + data.works.length + "개, " + data.weeks.length + "주 기록";
    document.getElementById("site-owner").textContent = data.site.owner;
    buildFilters();
    render();
  }

  fetch("data/works.json")
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(init)
    .catch(function () {
      document.getElementById("timeline").textContent = "목록을 불러오지 못했습니다. 웹 서버로 열어 주세요.";
    });
})();
