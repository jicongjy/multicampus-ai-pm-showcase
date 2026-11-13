/* 관리 화면 (#/admin): 노트와 링크를 사이트 안에서 추가, 수정, 삭제하고 GitHub 저장소에 바로 커밋한다.
   토큰은 이 브라우저의 localStorage에만 저장되며 저장소나 코드에는 들어가지 않는다. */
(function () {
  "use strict";
  var LS = "pm-admin";
  var DEFAULT_REPO = "jicongjy/pm-archive";

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === "text") n.textContent = v;
      else n.setAttribute(k, v === true ? "" : v);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return n;
  }
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function today() { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }

  /* ---------- 설정과 토큰 보관 ----------
     토큰은 암호로 암호화(AES-GCM, PBKDF2)해서 이 브라우저에만 저장한다. 풀린 토큰은 메모리에만 있고 새로고침, 잠그기, 15분 무조작이면 사라진다. */
  var TOKEN = "", idleTimer = null;
  var IDLE_MS = 15 * 60 * 1000;
  function cfg() { try { return JSON.parse(localStorage.getItem(LS) || "{}"); } catch (e) { return {}; } }
  function saveCfg(c) { try { localStorage.setItem(LS, JSON.stringify(c)); } catch (e) {} }
  function b64(buf) { var a = new Uint8Array(buf), s = ""; for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s); }
  function unb64(t) { var s = atob(t), a = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }
  function deriveKey(pw, salt) {
    return crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveKey"]).then(function (base) {
      return crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt, iterations: 310000, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    });
  }
  function encryptToken(token, pw) {
    var salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    return deriveKey(pw, salt).then(function (k) { return crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, k, new TextEncoder().encode(token)); })
      .then(function (ct) { return { salt: b64(salt), iv: b64(iv), ct: b64(ct) }; });
  }
  function decryptToken(enc, pw) {
    return deriveKey(pw, unb64(enc.salt)).then(function (k) { return crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(enc.iv) }, k, unb64(enc.ct)); })
      .then(function (pt) { return new TextDecoder().decode(pt); });
  }
  function lock(redraw) { TOKEN = ""; clearTimeout(idleTimer); if (redraw) redraw(); }
  function touch(redraw) {
    clearTimeout(idleTimer);
    if (TOKEN) idleTimer = setTimeout(function () { lock(redraw); }, IDLE_MS);
  }

  /* ---------- GitHub API ---------- */
  function gh(path, opt) {
    var c = cfg(); opt = opt || {};
    var headers = { Authorization: "Bearer " + TOKEN, Accept: opt.raw ? "application/vnd.github.raw+json" : "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
    if (opt.body) headers["Content-Type"] = "application/json";
    return fetch("https://api.github.com/repos/" + c.repo + path, { method: opt.method || "GET", cache: "no-store", headers: headers, body: opt.body ? JSON.stringify(opt.body) : undefined })
      .then(function (r) {
        if (!r.ok) {
          return r.text().then(function (t) {
            var why = r.status === 401 ? "토큰이 올바르지 않거나 만료되었습니다." : (r.status === 403 || r.status === 404) ? "토큰 권한이나 저장소 이름을 확인하세요." : t.slice(0, 140);
            throw new Error(r.status + " " + why);
          });
        }
        return opt.raw ? r.text() : r.json();
      });
  }
  function readFile(path) {
    var c = cfg();
    return gh("/contents/" + path.split("/").map(encodeURIComponent).join("/") + "?ref=" + encodeURIComponent(c.branch || "main"), { raw: true });
  }
  function readJson(path) { return readFile(path).then(function (t) { return JSON.parse(t); }); }
  function jsonText(o) { return JSON.stringify(o, null, 2) + "\n"; }

  /* 파일 여러 개를 한 커밋으로 저장 */
  function commit(message, writes, deletes) {
    var c = cfg(), branch = c.branch || "main", base, tree;
    return gh("/git/ref/heads/" + branch)
      .then(function (r) { base = r.object.sha; return gh("/git/commits/" + base); })
      .then(function (cm) {
        tree = cm.tree.sha;
        return Promise.all(writes.map(function (w) {
          return gh("/git/blobs", { method: "POST", body: { content: w.content, encoding: "utf-8" } })
            .then(function (b) { return { path: w.path, mode: "100644", type: "blob", sha: b.sha }; });
        }));
      })
      .then(function (entries) {
        (deletes || []).forEach(function (p) { entries.push({ path: p, mode: "100644", type: "blob", sha: null }); });
        return gh("/git/trees", { method: "POST", body: { base_tree: tree, tree: entries } });
      })
      .then(function (t) { return gh("/git/commits", { method: "POST", body: { message: message, tree: t.sha, parents: [base] } }); })
      .then(function (cm) { return gh("/git/refs/heads/" + branch, { method: "PATCH", body: { sha: cm.sha } }); });
  }

  /* ---------- 본문 정리(허용한 태그만 남김) ---------- */
  var KEEP = { H2: "h2", H3: "h3", P: "p", STRONG: "strong", B: "strong", EM: "em", I: "em", UL: "ul", OL: "ol", LI: "li", BLOCKQUOTE: "blockquote", CODE: "code", PRE: "pre", BR: "br", HR: "hr", TABLE: "table", THEAD: "thead", TBODY: "tbody", TR: "tr", TH: "th", TD: "td" };
  var BLOCK = { h2: 1, h3: 1, p: 1, ul: 1, ol: 1, blockquote: 1, pre: 1, hr: 1, table: 1 };
  function esc(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function safeHref(u) {
    try { var x = new URL(u, "https://x.invalid/"); return /^(https?:|mailto:)$/.test(x.protocol) ? u : ""; } catch (e) { return ""; }
  }
  function clean(node) {
    var out = "";
    Array.prototype.forEach.call(node.childNodes, function (c) {
      if (c.nodeType === 3) { out += esc(c.nodeValue); return; }
      if (c.nodeType !== 1) return;
      var tag = c.tagName;
      if (tag === "A") {
        var h = safeHref(c.getAttribute("href") || "");
        var inner = clean(c);
        out += h ? '<a href="' + esc(h).replace(/"/g, "&quot;") + '" target="_blank" rel="noopener noreferrer">' + inner + "</a>" : inner;
        return;
      }
      if (tag === "DIV" && c.classList.contains("tbl")) { out += '<div class="tbl">' + clean(c) + "</div>"; return; }
      var k = KEEP[tag];
      if (!k) {
        /* 줄바꿈 단위로 쓰이는 div는 문단으로 */
        if (tag === "DIV") { var t = clean(c); out += /<(h2|h3|p|ul|ol|blockquote|pre|table|hr)/.test(t) ? t : (t.trim() ? "<p>" + t + "</p>" : ""); }
        else out += clean(c);
        return;
      }
      if (k === "br") { out += "<br>"; return; }
      if (k === "hr") { out += "<hr>"; return; }
      out += "<" + k + ">" + clean(c) + "</" + k + ">";
    });
    return out;
  }
  function sanitize(html) {
    var doc = new DOMParser().parseFromString("<body>" + html + "</body>", "text/html");
    var s = clean(doc.body);
    /* 블록 밖에 남은 글자는 문단으로 감싼다 */
    var tmp = new DOMParser().parseFromString("<body>" + s + "</body>", "text/html").body;
    var parts = [], buf = "";
    function flush() { if (buf.replace(/<br>|\s/g, "")) parts.push("<p>" + buf.trim() + "</p>"); buf = ""; }
    Array.prototype.forEach.call(tmp.childNodes, function (c) {
      if (c.nodeType === 1 && (BLOCK[c.tagName.toLowerCase()] || (c.tagName === "DIV"))) { flush(); parts.push(c.outerHTML); }
      else buf += c.nodeType === 3 ? esc(c.nodeValue) : c.outerHTML;
    });
    flush();
    return parts.filter(function (p) { return !/^<p>(\s|<br>)*<\/p>$/.test(p); }).join("\n") + "\n";
  }

  /* 노트 메타(제목 목록, 구성 막대, 읽는 시간) */
  function noteMeta(html) {
    var box = new DOMParser().parseFromString("<body>" + html + "</body>", "text/html").body;
    var heads = [], parts = [], total = 0;
    var hs = box.querySelectorAll("h2,h3");
    var top = 9;
    Array.prototype.forEach.call(hs, function (h) { top = Math.min(top, +h.tagName.charAt(1)); });
    var cur = null;
    Array.prototype.forEach.call(box.childNodes, function (c) {
      var t = (c.textContent || "").replace(/\s+/g, "");
      total += t.length;
      if (c.nodeType === 1 && /^H[23]$/.test(c.tagName)) {
        var title = c.textContent.replace(/^\d+(?:[-.]\d+)*[.)]?\s+/, "").replace(/[*`]/g, "").trim();
        if (title && heads.indexOf(title) < 0) heads.push(title);
        if (+c.tagName.charAt(1) === top) { cur = { t: title.length <= 30 ? title : title.slice(0, 28) + "…", n: 0 }; parts.push(cur); }
      } else if (cur) cur.n += t.length;
    });
    return {
      headings: heads.slice(0, 5), parts: parts.filter(function (p) { return p.n > 0; }), sections: heads.length,
      mins: Math.max(1, Math.round(total / 500)),
      first: ((box.querySelector("p") || {}).textContent || "").replace(/\s+/g, " ").trim().slice(0, 90)
    };
  }

  /* ---------- 화면 ---------- */
  var ctx, root, statusEl;

  function say(msg, kind) {
    if (!statusEl) return;
    statusEl.textContent = msg;
    statusEl.className = "ad-status" + (kind ? " " + kind : "");
  }

  function mount(view, c) {
    ctx = c;
    var page = el("div", { class: "page wide pfit admin" });
    root = page;
    page.appendChild(el("header", { class: "phead" }, [
      el("p", { class: "eyebrow", text: "ADMIN" }),
      el("h1", { text: "관리" }),
      el("p", { class: "lead", text: "노트와 링크를 여기서 추가합니다. 저장하면 저장소에 바로 커밋되고 1~2분 뒤 사이트에 반영됩니다." })
    ]));
    var body = el("div", { class: "fscroll" });
    page.appendChild(body);
    view.appendChild(page);
    draw(body, "notes");
  }

  function draw(body, tab) {
    body.textContent = "";
    var c = cfg();
    if (c.token) { c = { repo: c.repo, branch: c.branch }; saveCfg(c); }   /* 예전에 평문으로 저장된 토큰은 지운다 */
    var again = function () { draw(body, tab); };
    if (!c.enc) { body.appendChild(connectPanel(again)); return; }
    if (!TOKEN) { body.appendChild(unlockPanel(c, again)); return; }
    touch(again);
    body.onclick = body.onkeydown = function () { touch(again); };

    var bar = el("div", { class: "ad-bar" });
    var tabs = el("div", { class: "ad-tabs" }, [["notes", "노트"], ["links", "링크"]].map(function (t) {
      var b = el("button", { type: "button", class: "ad-tab" + (t[0] === tab ? " on" : ""), text: t[1] });
      b.addEventListener("click", function () { draw(body, t[0]); });
      return b;
    }));
    var lk = el("button", { type: "button", class: "ad-link", text: "잠그기" });
    lk.addEventListener("click", function () { lock(again); });
    var out = el("button", { type: "button", class: "ad-link", text: "연결 해제" });
    out.addEventListener("click", function () { if (confirm("저장된 토큰을 이 브라우저에서 지울까요?")) { lock(); saveCfg({}); again(); } });
    bar.appendChild(tabs);
    bar.appendChild(el("span", { class: "ad-conn", text: c.repo + " · " + (c.branch || "main") }));
    bar.appendChild(lk);
    bar.appendChild(out);
    body.appendChild(bar);
    statusEl = el("p", { class: "ad-status", role: "status" });
    body.appendChild(statusEl);
    if (tab === "notes") notesTab(body); else linksTab(body);
  }

  function field(label, input, hint) {
    return el("label", { class: "ad-f" }, [el("span", { class: "ad-l", text: label }), input, hint ? el("small", { text: hint }) : null]);
  }

  /* ----- 연결, 잠금 해제 ----- */
  function connectPanel(done) {
    var repo = el("input", { type: "text", value: DEFAULT_REPO, autocomplete: "off", spellcheck: "false" });
    var token = el("input", { type: "password", placeholder: "github_pat_…", autocomplete: "off", spellcheck: "false" });
    var pw = el("input", { type: "password", placeholder: "8자 이상", autocomplete: "new-password" });
    var pw2 = el("input", { type: "password", placeholder: "한 번 더", autocomplete: "new-password" });
    var msg = el("p", { class: "ad-status" });
    var go = el("button", { type: "button", class: "ad-btn", text: "연결하고 암호 걸기" });
    function fail(t) { msg.textContent = t; msg.className = "ad-status err"; go.disabled = false; }
    go.addEventListener("click", function () {
      var t = token.value.trim(), r = repo.value.trim();
      if (!t || !/^[\w.-]+\/[\w.-]+$/.test(r)) { fail("저장소(주인/이름)와 토큰을 입력하세요."); return; }
      if (pw.value.length < 8) { fail("암호는 8자 이상으로 정하세요."); return; }
      if (pw.value !== pw2.value) { fail("암호 두 칸이 서로 다릅니다."); return; }
      go.disabled = true; msg.textContent = "확인 중…"; msg.className = "ad-status";
      saveCfg({ repo: r, branch: "main" }); TOKEN = t;
      var branch = "main";
      gh("").then(function (info) {
        if (!info.permissions || !info.permissions.push) throw new Error("이 토큰에는 쓰기 권한이 없습니다. Contents 권한을 Read and write로 만드세요.");
        branch = info.default_branch || "main";
        return encryptToken(t, pw.value);
      }).then(function (enc) { saveCfg({ repo: r, branch: branch, enc: enc }); done(); })
        .catch(function (e) { TOKEN = ""; saveCfg({}); fail("연결하지 못했습니다. " + e.message); });
    });
    return el("section", { class: "ad-card ad-connect" }, [
      el("h2", { text: "GitHub 연결" }),
      el("p", { class: "ad-help", text: "이 저장소에만 쓰기 권한이 있는 토큰을 한 번 입력하고 암호를 정하면, 토큰은 암호로 잠겨서 이 브라우저에만 저장됩니다. 다음부터는 암호만 넣으면 됩니다." }),
      el("ol", { class: "ad-steps" }, [
        el("li", { text: "GitHub → Settings → Developer settings → Fine-grained tokens → Generate new token" }),
        el("li", { text: "Repository access: Only select repositories → pm-archive" }),
        el("li", { text: "Permissions: Contents → Read and write (이것 하나면 됩니다)" })
      ]),
      field("저장소", repo), field("토큰", token), field("암호", pw), field("암호 확인", pw2, "암호를 잊으면 복구할 수 없고, 토큰을 다시 넣어야 합니다."), go, msg
    ]);
  }

  function unlockPanel(c, done) {
    var pw = el("input", { type: "password", placeholder: "암호", autocomplete: "current-password" });
    var msg = el("p", { class: "ad-status" });
    var go = el("button", { type: "button", class: "ad-btn", text: "열기" });
    var reset = el("button", { type: "button", class: "ad-link", text: "암호를 잊었어요 (토큰 다시 입력)" });
    function open() {
      if (!pw.value) return;
      go.disabled = true; msg.textContent = "확인 중…"; msg.className = "ad-status";
      decryptToken(c.enc, pw.value).then(function (t) { TOKEN = t; done(); })
        .catch(function () { go.disabled = false; pw.value = ""; msg.textContent = "암호가 맞지 않습니다."; msg.className = "ad-status err"; pw.focus(); });
    }
    go.addEventListener("click", open);
    pw.addEventListener("keydown", function (e) { if (e.key === "Enter") open(); });
    reset.addEventListener("click", function () { if (confirm("저장된 토큰을 지우고 처음부터 다시 연결할까요?")) { saveCfg({}); done(); } });
    setTimeout(function () { pw.focus(); }, 50);
    return el("section", { class: "ad-card ad-connect" }, [
      el("h2", { text: "관리 화면 잠금" }),
      el("p", { class: "ad-help", text: "저장해 둔 토큰은 암호로 잠겨 있습니다. 암호를 입력하면 열립니다." }),
      field("암호", pw), go, msg, reset
    ]);
  }

  /* ----- 노트 ----- */
  function weekOfDate(d) {
    var w = ctx.data.weeks.filter(function (x) { return d >= x.start && d <= x.end; })[0];
    return w ? w.id : ctx.data.weeks[ctx.data.weeks.length - 1].id;
  }

  function notesTab(body) {
    var editing = null;      // 수정 중인 노트(없으면 새 노트)
    var wrap = el("div", { class: "ad-grid" });
    var side = el("aside", { class: "ad-list" });
    var form = el("section", { class: "ad-card" });
    wrap.appendChild(side); wrap.appendChild(form);
    body.appendChild(wrap);

    function drawList() {
      side.textContent = "";
      var nb = el("button", { type: "button", class: "ad-btn ghost", text: "+ 새 노트" });
      nb.addEventListener("click", function () { editing = null; drawForm(); drawList(); });
      side.appendChild(nb);
      ctx.notes.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; }).forEach(function (n) {
        var b = el("button", { type: "button", class: "ad-li" + (editing && editing.id === n.id ? " on" : "") }, [el("b", { text: n.title }), el("span", { text: n.date })]);
        b.addEventListener("click", function () { editing = n; drawForm(); drawList(); });
        side.appendChild(b);
      });
    }

    function drawForm() {
      form.textContent = "";
      var n = editing;
      var title = el("input", { type: "text", value: n ? n.title : "", placeholder: "예: 15일차 학습 노트" });
      var date = el("input", { type: "date", value: n ? n.date : today() });
      var week = el("select", {}, ctx.data.weeks.map(function (w) { return el("option", { value: w.id, text: w.label + " (" + w.period + ")" }); }));
      week.value = n ? n.week : weekOfDate(date.value);
      date.addEventListener("change", function () { if (date.value) week.value = weekOfDate(date.value); });
      var one = el("input", { type: "text", value: n ? (n.one || "") : "", placeholder: "이 날 배운 것을 한 문장으로" });

      var picked = {};
      (n ? n.works : []).forEach(function (w) { picked[w] = true; });
      var chips = el("div", { class: "ad-chips" }, ctx.works.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; }).map(function (w) {
        var b = el("button", { type: "button", class: "ad-chip" + (picked[w.id] ? " on" : ""), text: w.title });
        b.addEventListener("click", function () { picked[w.id] = !picked[w.id]; b.classList.toggle("on", !!picked[w.id]); });
        return b;
      }));

      var termLines = n ? n.terms.map(function (t) {
        var x = ctx.terms.filter(function (y) { return y.name === t; })[0];
        return t + (x && x.def ? " | " + x.def : "");
      }).join("\n") : "";
      var terms = el("textarea", { rows: "4", placeholder: "한 줄에 하나씩, 이름 | 정의\n예) 프롬프트 | AI에게 일을 시키는 문장\n이미 있는 용어는 이름만 써도 됩니다.", spellcheck: "false" });
      terms.value = termLines;

      var editor = buildEditor();
      if (n) {
        editor.set("<p>불러오는 중…</p>");
        readFile(n.html).then(function (h) { editor.set(h); }).catch(function (e) { editor.set("<p>본문을 불러오지 못했습니다. " + e.message.replace(/</g, "") + "</p>"); });
      }

      var save = el("button", { type: "button", class: "ad-btn", text: n ? "수정 저장" : "저장" });
      var del = n ? el("button", { type: "button", class: "ad-btn danger", text: "삭제" }) : null;

      save.addEventListener("click", function () {
        if (!title.value.trim() || !date.value) { say("제목과 날짜는 꼭 필요합니다.", "err"); return; }
        var html = sanitize(editor.get());
        if (!html.replace(/<[^>]+>|\s/g, "")) { say("본문을 써 주세요.", "err"); return; }
        save.disabled = true; say("저장 중…");
        saveNote({
          old: n, title: title.value.trim(), date: date.value, week: week.value, one: one.value.trim(), html: html,
          works: Object.keys(picked).filter(function (k) { return picked[k]; }), termsText: terms.value
        }).then(function (saved) {
          editing = saved; say("저장했습니다. 1~2분 뒤 사이트에 반영됩니다.", "ok"); drawList(); drawForm();
        }).catch(function (e) { save.disabled = false; say("저장하지 못했습니다. " + e.message, "err"); });
      });
      if (del) del.addEventListener("click", function () {
        if (!confirm("이 노트를 삭제할까요? 저장소에서 지워집니다.")) return;
        del.disabled = true; say("삭제 중…");
        removeNote(n).then(function () { editing = null; say("삭제했습니다.", "ok"); drawList(); drawForm(); })
          .catch(function (e) { del.disabled = false; say("삭제하지 못했습니다. " + e.message, "err"); });
      });

      form.appendChild(el("h2", { text: n ? "노트 수정" : "새 노트" }));
      form.appendChild(el("div", { class: "ad-row" }, [field("제목", title), field("날짜", date), field("주차", week)]));
      form.appendChild(field("한 줄 요약", one));
      form.appendChild(el("div", { class: "ad-f" }, [el("span", { class: "ad-l", text: "만든 결과물" }), chips]));
      form.appendChild(field("배운 용어", terms));
      form.appendChild(el("div", { class: "ad-f" }, [el("span", { class: "ad-l", text: "본문" }), editor.node]));
      form.appendChild(el("div", { class: "ad-actions" }, [save, del]));
    }

    drawList(); drawForm();
  }

  /* 에디터: 서식 막대 + 글쓰기 영역 */
  function buildEditor() {
    var area = el("div", { class: "ad-editor prose", contenteditable: "true", spellcheck: "false", "data-ph": "여기에 노트를 쓰세요. 위 막대로 제목, 목록, 굵게를 넣을 수 있습니다." });
    try { document.execCommand("defaultParagraphSeparator", false, "p"); } catch (e) {}
    function cmd(name, val) { area.focus(); document.execCommand(name, false, val); }
    function block(tag) {
      area.focus();
      var sel = window.getSelection(), n = sel.anchorNode;
      while (n && n !== area && !(n.nodeType === 1 && /^(H2|H3|P|BLOCKQUOTE|LI|DIV)$/.test(n.tagName))) n = n.parentNode;
      var same = n && n.nodeType === 1 && n.tagName.toLowerCase() === tag;
      document.execCommand("formatBlock", false, same ? "p" : tag);
    }
    var tools = [
      ["제목", function () { block("h2"); }, "h2"], ["소제목", function () { block("h3"); }, "h3"],
      ["굵게", function () { cmd("bold"); }, "b"], ["기울임", function () { cmd("italic"); }, "i"],
      ["목록", function () { cmd("insertUnorderedList"); }, "ul"], ["번호", function () { cmd("insertOrderedList"); }, "ol"],
      ["인용", function () { block("blockquote"); }, "q"],
      ["링크", function () {
        var u = prompt("연결할 주소 (https://…)");
        if (!u) return;
        if (!safeHref(u) || !/^(https?:|mailto:)/.test(u)) { alert("http, https, mailto 주소만 넣을 수 있습니다."); return; }
        cmd("createLink", u);
      }, "a"],
      ["서식 지우기", function () { cmd("removeFormat"); block("p"); }, "x"]
    ];
    var bar = el("div", { class: "ad-tools" }, tools.map(function (t) {
      var b = el("button", { type: "button", class: "ad-t t-" + t[2], text: t[0], title: t[0] });
      b.addEventListener("mousedown", function (e) { e.preventDefault(); });   /* 선택 영역 유지 */
      b.addEventListener("click", t[1]);
      return b;
    }));
    /* 붙여넣기는 글자만 */
    area.addEventListener("paste", function (e) {
      e.preventDefault();
      var t = (e.clipboardData || window.clipboardData).getData("text/plain");
      document.execCommand("insertText", false, t);
    });
    var node = el("div", { class: "ad-ed" }, [bar, area]);
    return { node: node, get: function () { return area.innerHTML; }, set: function (h) { area.innerHTML = sanitize(h); } };
  }

  function slug() { return Math.random().toString(36).slice(2, 6); }

  function recomputeTerms(terms, notes, names) {
    names.forEach(function (name) {
      var have = notes.filter(function (n) { return n.terms.indexOf(name) >= 0; });
      var idx = -1;
      terms.forEach(function (t, i) { if (t.name === name) idx = i; });
      if (!have.length) { if (idx >= 0) terms.splice(idx, 1); return; }
      var t = idx >= 0 ? terms[idx] : { name: name, def: "" };
      t.first = have.map(function (n) { return n.date; }).sort()[0];
      t.notes = have.map(function (n) { return n.id; });
      var ws = [];
      have.forEach(function (n) { (n.works || []).forEach(function (w) { if (ws.indexOf(w) < 0) ws.push(w); }); });
      t.works = ws;
      if (idx < 0) terms.push(t);
    });
  }

  function saveNote(f) {
    var meta = noteMeta(f.html);
    var defs = {}, names = [];
    f.termsText.split("\n").forEach(function (line) {
      var p = line.split("|"), nm = p[0].trim();
      if (!nm || names.indexOf(nm) >= 0) return;
      names.push(nm);
      if (p.length > 1 && p.slice(1).join("|").trim()) defs[nm] = p.slice(1).join("|").trim();
    });
    return Promise.all([readJson("data/notes.json"), readJson("data/terms.json")]).then(function (r) {
      var nj = r[0], tj = r[1];
      var id = f.old ? f.old.id : "n-" + f.date.replace(/-/g, "") + "-" + slug();
      var entry = {
        id: id, title: f.title, week: f.week, date: f.date, summary: f.one || meta.first, one: f.one, works: f.works, terms: names,
        html: "notes/" + id + ".html", headings: meta.headings, parts: meta.parts, sections: meta.sections, mins: meta.mins
      };
      var affected = names.slice();
      var pos = -1;
      nj.notes.forEach(function (n, i) { if (n.id === id) pos = i; });
      if (pos >= 0) { (nj.notes[pos].terms || []).forEach(function (t) { if (affected.indexOf(t) < 0) affected.push(t); }); nj.notes[pos] = entry; }
      else nj.notes.push(entry);
      nj.notes.sort(function (a, b) { return a.date === b.date ? (a.id < b.id ? 1 : -1) : (a.date < b.date ? 1 : -1); });
      /* 새 용어의 정의, 바뀐 정의 반영 */
      names.forEach(function (nm) {
        var t = tj.terms.filter(function (x) { return x.name === nm; })[0];
        if (t && defs[nm]) t.def = defs[nm];
        if (!t) tj.terms.push({ name: nm, def: defs[nm] || "", first: f.date, notes: [id], works: [] });
      });
      recomputeTerms(tj.terms, nj.notes, affected);
      return commit((f.old ? "content: 노트 수정 - " : "content: 노트 추가 - ") + f.title, [
        { path: "notes/" + id + ".html", content: f.html },
        { path: "data/notes.json", content: jsonText(nj) },
        { path: "data/terms.json", content: jsonText(tj) }
      ], []).then(function () {
        /* 화면에 쓰는 배열도 같이 갱신 */
        ctx.notes.length = 0; Array.prototype.push.apply(ctx.notes, nj.notes);
        ctx.terms.length = 0; Array.prototype.push.apply(ctx.terms, tj.terms);
        return entry;
      });
    });
  }

  function removeNote(n) {
    return Promise.all([readJson("data/notes.json"), readJson("data/terms.json")]).then(function (r) {
      var nj = r[0], tj = r[1];
      nj.notes = nj.notes.filter(function (x) { return x.id !== n.id; });
      recomputeTerms(tj.terms, nj.notes, (n.terms || []).slice());
      return commit("content: 노트 삭제 - " + n.title, [
        { path: "data/notes.json", content: jsonText(nj) },
        { path: "data/terms.json", content: jsonText(tj) }
      ], [n.html]).then(function () {
        ctx.notes.length = 0; Array.prototype.push.apply(ctx.notes, nj.notes);
        ctx.terms.length = 0; Array.prototype.push.apply(ctx.terms, tj.terms);
      });
    });
  }

  /* ----- 링크 ----- */
  function linksTab(body) {
    var form = el("section", { class: "ad-card" });
    var title = el("input", { type: "text", placeholder: "예: 토스 블로그 글 제목" });
    var url = el("input", { type: "url", placeholder: "https://", spellcheck: "false" });
    var note = el("input", { type: "text", placeholder: "출처나 짧은 메모 (선택)" });
    var date = el("input", { type: "date", value: today() });
    var week = el("select", {}, ctx.data.weeks.map(function (w) { return el("option", { value: w.id, text: w.label }); }));
    week.value = weekOfDate(date.value);
    date.addEventListener("change", function () { if (date.value) week.value = weekOfDate(date.value); });
    var add = el("button", { type: "button", class: "ad-btn", text: "링크 추가" });
    add.addEventListener("click", function () {
      var u = url.value.trim();
      if (!title.value.trim() || !/^https?:\/\//i.test(u)) { say("제목과 http(s) 주소를 입력하세요.", "err"); return; }
      add.disabled = true; say("저장 중…");
      readJson("data/links.json").then(function (lj) {
        var entry = { id: "l-" + date.value.replace(/-/g, "") + "-" + slug(), title: title.value.trim(), url: u, note: note.value.trim(), date: date.value, week: week.value };
        lj.links.unshift(entry);
        return commit("content: 링크 추가 - " + entry.title, [{ path: "data/links.json", content: jsonText(lj) }], []).then(function () {
          ctx.links.length = 0; Array.prototype.push.apply(ctx.links, lj.links);
          title.value = ""; url.value = ""; note.value = "";
          add.disabled = false;
          say("저장했습니다. 아이콘은 자동으로 가져오며, 1~2분 뒤 사이트에 반영됩니다.", "ok");
          drawLinkList();
        });
      }).catch(function (e) { add.disabled = false; say("저장하지 못했습니다. " + e.message, "err"); });
    });
    form.appendChild(el("h2", { text: "링크 추가" }));
    form.appendChild(field("제목", title));
    form.appendChild(field("주소", url));
    form.appendChild(field("메모", note));
    form.appendChild(el("div", { class: "ad-row two" }, [field("날짜", date), field("주차", week)]));
    form.appendChild(el("div", { class: "ad-actions" }, [add]));
    body.appendChild(form);

    var listBox = el("section", { class: "ad-card" });
    body.appendChild(listBox);
    function drawLinkList() {
      listBox.textContent = "";
      listBox.appendChild(el("h2", { text: "저장된 링크 " + ctx.links.length + "개" }));
      ctx.links.forEach(function (l) {
        var rm = el("button", { type: "button", class: "ad-link", text: "삭제" });
        rm.addEventListener("click", function () {
          if (!confirm("이 링크를 삭제할까요?")) return;
          rm.disabled = true; say("삭제 중…");
          readJson("data/links.json").then(function (lj) {
            var gone = lj.links.filter(function (x) { return x.id === l.id; })[0];
            lj.links = lj.links.filter(function (x) { return x.id !== l.id; });
            var del = gone && gone.icon && /^assets\/links\/[\w.-]+$/.test(gone.icon) ? [gone.icon] : [];
            return commit("content: 링크 삭제 - " + l.title, [{ path: "data/links.json", content: jsonText(lj) }], del).then(function () {
              ctx.links.length = 0; Array.prototype.push.apply(ctx.links, lj.links);
              say("삭제했습니다.", "ok"); drawLinkList();
            });
          }).catch(function (e) { rm.disabled = false; say("삭제하지 못했습니다. " + e.message, "err"); });
        });
        listBox.appendChild(el("div", { class: "ad-li-row" }, [el("div", {}, [el("b", { text: l.title }), el("span", { text: l.url })]), rm]));
      });
    }
    drawLinkList();
  }

  window.PMAdmin = { mount: mount };
})();
