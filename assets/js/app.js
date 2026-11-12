// iPAS 書齋 — 主程式（hash 路由 + 各頁面）
import * as api from "./api.js";
import { APP_NAME, PASS_SCORE, MINUTES_PER_QUESTION } from "./config.js";
import { mountTeacher, drawAvatar, avatarEl, AVATAR_KEYS, AVATAR_NAMES } from "./pixel-teacher.js";
import { radarSVG, calendarEl, fmtDuration, localDateStr } from "./charts.js";
import { playGrading } from "./grading.js";

const $ = (sel, root = document) => root.querySelector(sel);
const h = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const state = {
  syllabus: null,
  profile: null,
  session: null,
  exam: null,          // 進行中的考試
  teacher: null,       // dashboard 老師
  calMonth: new Date(),
};

// ============================================================
// 路由
// ============================================================
const routes = {
  "/login": viewLogin,
  "/": viewDashboard,
  "/exam/setup": viewExamSetup,
  "/exam/run": viewExamRun,
  "/result": viewResult,       // #/result/<sessionId>
  "/review": viewReview,       // #/review/<sessionId>
  "/wrongbook": viewWrongBook,
  "/history": viewHistory,
  "/profile": viewProfile,
  "/admin": viewAdmin,
};

function parseHash() {
  const raw = location.hash.replace(/^#/, "") || "/";
  const parts = raw.split("/").filter(Boolean);
  if (parts.length === 0) return { path: "/", arg: null };
  if (parts.length === 1) return { path: "/" + parts[0], arg: null };
  const two = "/" + parts[0] + "/" + parts[1];
  if (routes[two]) return { path: two, arg: parts[2] ?? null };
  return { path: "/" + parts[0], arg: parts[1] ?? null };
}
export function go(path) { location.hash = "#" + path; }

async function router() {
  const main = $("#main");
  const { path, arg } = parseHash();
  state.session = await api.getSession();
  if (!state.session && path !== "/login") { go("/login"); return; }
  if (state.session && path === "/login") { go("/"); return; }
  if (state.session && !state.profile) {
    try { state.profile = await api.getProfile(); } catch { state.profile = { display_name: "考生", avatar: "cat", target_level: "L1" }; }
  }
  if (state.teacher) { state.teacher.destroy(); state.teacher = null; }
  renderTopbar(path);
  main.innerHTML = `<div class="loading">載入中</div>`;
  const view = routes[path] || viewDashboard;
  try { await view(main, arg); }
  catch (e) { console.error(e); main.innerHTML = `<div class="card"><h2>出了點狀況</h2><p>${esc(e.message || e)}</p><button onclick="location.reload()">重新整理</button></div>`; }
}

function renderTopbar(path) {
  const nav = $("#nav");
  const who = $("#who");
  if (!state.session) { nav.innerHTML = ""; who.innerHTML = ""; return; }
  const tabs = [["/", "書齋"], ["/exam/setup", "模擬考"], ["/wrongbook", "錯題本"], ["/history", "成績簿"], ["/profile", "學籍"]];
  if (state.profile?.is_admin) tabs.push(["/admin", "題庫"]);
  nav.innerHTML = tabs.map(([p, n]) => `<button class="tab ${path === p ? "active" : ""}" data-go="${p}">${n}</button>`).join("");
  nav.querySelectorAll("button").forEach(b => b.addEventListener("click", () => go(b.dataset.go)));
  who.innerHTML = "";
  who.appendChild(avatarEl(state.profile?.avatar || "cat", 28));
  who.appendChild(h(`<span class="pixel">${esc(state.profile?.display_name || "")}</span>`));
  const out = h(`<button class="small ghost">登出</button>`);
  out.addEventListener("click", async () => { await api.signOut(); state.profile = null; go("/login"); });
  who.appendChild(out);
}

// ============================================================
// 登入 / 註冊
// ============================================================
async function viewLogin(main) {
  main.innerHTML = "";
  const card = h(`
    <div class="grid two">
      <div class="card board">
        <div class="teacher-stage">
          <canvas class="teacher"></canvas>
          <div class="bubble"><span class="who">老學究老師</span>來者何人？先在學籍簿上留個名，老夫才好替你批卷。</div>
        </div>
        <p style="margin-top:1rem">這是 iPAS「AI應用規劃師」初級／中級的模擬考書齋：亂數出題、弱項加重、逐選項錯題解析、五力圖與出席簿。</p>
      </div>
      <div class="card ruled">
        <div class="row" role="tablist">
          <button class="small ghost" id="tab-in">登入</button>
          <button class="small ghost" id="tab-up">註冊新學籍</button>
        </div>
        <form id="f-in">
          <label for="in-email">Email</label><input id="in-email" type="email" required autocomplete="email">
          <label for="in-pw">密碼</label><input id="in-pw" type="password" required autocomplete="current-password">
          <div class="row" style="margin-top:1rem"><button class="primary" type="submit">進入書齋</button></div>
          <div class="msg" id="in-msg" hidden></div>
        </form>
        <form id="f-up" hidden>
          <label for="up-name">稱呼</label><input id="up-name" type="text" required maxlength="20" placeholder="老師要怎麼叫你">
          <label>頭像</label>
          <div class="avatar-pick" id="up-avatar"></div>
          <label>目標級別</label>
          <div class="choice-row" id="up-level">
            <label class="choice on"><input type="radio" name="lv" value="L1" checked>初級</label>
            <label class="choice"><input type="radio" name="lv" value="L2">中級</label>
          </div>
          <div class="field-row">
            <div><label for="up-email">Email</label><input id="up-email" type="email" required autocomplete="email"></div>
            <div><label for="up-pw">密碼（至少 6 碼）</label><input id="up-pw" type="password" required minlength="6" autocomplete="new-password"></div>
          </div>
          <div class="row" style="margin-top:1rem"><button class="primary" type="submit">建立學籍</button></div>
          <div class="msg" id="up-msg" hidden></div>
        </form>
      </div>
    </div>`);
  main.appendChild(card);
  state.teacher = mountTeacher($("canvas.teacher", card), "neutral");

  const fin = $("#f-in", card), fup = $("#f-up", card);
  $("#tab-in", card).onclick = () => { fin.hidden = false; fup.hidden = true; };
  $("#tab-up", card).onclick = () => { fin.hidden = true; fup.hidden = false; };

  // 頭像選擇
  const pick = $("#up-avatar", card);
  let avatar = "cat";
  AVATAR_KEYS.forEach(k => {
    const lab = h(`<label class="choice ${k === avatar ? "on" : ""}" title="${AVATAR_NAMES[k]}"><canvas></canvas></label>`);
    drawAvatar($("canvas", lab), k);
    lab.addEventListener("click", () => { avatar = k; pick.querySelectorAll(".choice").forEach(c => c.classList.remove("on")); lab.classList.add("on"); });
    pick.appendChild(lab);
  });
  bindChoiceRow($("#up-level", card));

  fin.addEventListener("submit", async e => {
    e.preventDefault();
    const msg = $("#in-msg", card); msg.hidden = true;
    try { await api.signIn($("#in-email", card).value.trim(), $("#in-pw", card).value); state.profile = null; go("/"); }
    catch (err) { msg.hidden = false; msg.textContent = friendlyAuthError(err); }
  });
  fup.addEventListener("submit", async e => {
    e.preventDefault();
    const msg = $("#up-msg", card); msg.hidden = true; msg.className = "msg";
    try {
      const data = await api.signUp({
        email: $("#up-email", card).value.trim(), password: $("#up-pw", card).value,
        display_name: $("#up-name", card).value.trim(), avatar,
        target_level: fup.querySelector("input[name=lv]:checked").value,
      });
      if (data.session) { state.profile = null; go("/"); }
      else { msg.hidden = false; msg.className = "msg ok"; msg.textContent = "學籍已建立。請到信箱點確認連結，再回來登入。"; }
    } catch (err) { msg.hidden = false; msg.textContent = friendlyAuthError(err); }
  });
}

function friendlyAuthError(err) {
  const m = String(err?.message || err);
  if (/Invalid login credentials/i.test(m)) return "Email 或密碼不對。";
  if (/Email not confirmed/i.test(m)) return "Email 還沒確認，請先到信箱點確認連結。";
  if (/already registered|already been registered/i.test(m)) return "這個 Email 已經有學籍了，請直接登入。";
  if (/rate limit/i.test(m)) return "操作太頻繁，稍等一下再試。";
  return m;
}

function bindChoiceRow(row, { multi = false } = {}) {
  row.querySelectorAll(".choice").forEach(lab => {
    const input = $("input", lab);
    lab.addEventListener("click", (e) => {
      if (e.target !== input) { e.preventDefault(); }
      if (multi) { input.checked = !input.checked; lab.classList.toggle("on", input.checked); }
      else { row.querySelectorAll(".choice").forEach(c => c.classList.remove("on")); input.checked = true; lab.classList.add("on"); }
      row.dispatchEvent(new Event("change"));
    });
  });
}

// ============================================================
// 書齋（Dashboard）
// ============================================================
async function viewDashboard(main) {
  const syl = state.syllabus ??= await api.loadSyllabus();
  const level = state.profile.target_level || "L1";
  const data = await api.dashboard(level);
  const lv = syl.levels[level];
  const dims = lv.dimensions;
  const dimVals = {}, dimAtt = {};
  (data.dimensions || []).forEach(d => { dimVals[d.dimension] = Number(d.accuracy); dimAtt[d.dimension] = d.attempted; });
  const weakest = dims.filter(d => dimVals[d.key] != null).sort((a, b) => dimVals[a.key] - dimVals[b.key])[0];
  const t = data.totals || {};

  main.innerHTML = "";
  const wrap = h(`
    <div>
      <div class="card board">
        <div class="teacher-stage">
          <canvas class="teacher"></canvas>
          <div class="bubble typing" id="bubble"><span class="who">老學究老師</span><span id="bubble-text"></span>
            <button class="small ghost refresh" id="bubble-refresh" title="再說一句">再說一句</button></div>
        </div>
        <div class="row" style="margin-top:1rem">
          <button class="primary" data-go="/exam/setup">開始模擬考</button>
          <button class="ghost" data-go="/wrongbook">錯題本（${data.wrong_count ?? 0}）</button>
          <span class="sp"></span>
          <span class="pixel">目前目標：${lv.name}　<button class="small ghost" data-go="/profile">切換</button></span>
        </div>
      </div>
      <div class="stats" style="margin:1.5rem 0">
        <div class="tile"><b>${t.total_answered ?? 0}</b><span>累計答題數</span></div>
        <div class="tile"><b>${Math.round((t.total_seconds ?? 0) / 60)}</b><span>累計答題分鐘</span></div>
        <div class="tile"><b>${t.total_answered ? Math.round(100 * t.total_correct / t.total_answered) : 0}%</b><span>累計正確率</span></div>
        <div class="tile"><b>${data.streak ?? 0}</b><span>連續出席天數</span></div>
      </div>
      <div class="grid two">
        <div class="card ruled">
          <h2>學習五力圖　<small class="muted" style="font-family:var(--font-body);font-size:.8rem">${lv.name}・紅虛線＝70 分及格線</small></h2>
          <div class="radar-wrap" id="radar"></div>
          <ul class="radar-legend" id="legend"></ul>
        </div>
        <div class="card">
          <div id="calendar"></div>
          <h3 style="margin-top:1.25rem">最近考卷</h3>
          <table class="sessions" style="width:100%"><tbody id="recent"></tbody></table>
        </div>
      </div>
    </div>`);
  main.appendChild(wrap);
  wrap.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => go(b.dataset.go)));

  // 老師
  const mood0 = !t.total_answered ? "neutral" : (weakest && dimVals[weakest.key] < 50) ? "worried" : "happy";
  state.teacher = mountTeacher($("canvas.teacher", wrap), mood0);
  const stats = {
    display_name: state.profile.display_name, level: lv.name,
    total_answered: t.total_answered ?? 0, total_correct: t.total_correct ?? 0, total_minutes: Math.round((t.total_seconds ?? 0) / 60),
    streak: data.streak ?? 0, wrong_count: data.wrong_count ?? 0,
    dimensions: dims.map(d => ({ name: d.name, accuracy: dimVals[d.key] ?? null, attempted: dimAtt[d.key] ?? 0 })),
    weakest_dimension_name: weakest?.name ?? null,
    last_scores: (data.recent_sessions || []).filter(s => s.status === "finished").slice(0, 3).map(s => Math.round(100 * s.correct / s.total)),
  };
  const say = (force) => speak($("#bubble", wrap), $("#bubble-text", wrap), "dashboard", stats, force);
  say(false);
  $("#bubble-refresh", wrap).addEventListener("click", () => say(true));

  // 五力圖
  $("#radar", wrap).appendChild(radarSVG(dims, dimVals, dimAtt));
  $("#legend", wrap).innerHTML = dims.map(d => {
    const v = dimVals[d.key];
    return `<li class="${weakest && weakest.key === d.key ? "weak" : ""}"><span>${esc(d.name)} <small class="muted">${d.topics.join("、")}</small></span><em>${v == null ? "尚無資料" : `${Math.round(v)} 分 / ${dimAtt[d.key]} 題`}</em></li>`;
  }).join("");

  // 日曆
  const renderCal = () => {
    const box = $("#calendar", wrap); box.innerHTML = "";
    box.appendChild(calendarEl(data.daily || [], state.calMonth, (delta) => { state.calMonth = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth() + delta, 1); renderCal(); }));
  };
  renderCal();

  // 最近 sessions
  const rec = (data.recent_sessions || []).filter(s => s.status === "finished").slice(0, 6);
  $("#recent", wrap).innerHTML = rec.length ? rec.map(s => {
    const sc = Math.round(100 * s.correct / s.total);
    return `<tr><td>${new Date(s.started_at).toLocaleDateString("zh-TW")}</td><td>${s.subjects.join("+")}</td><td>${modeName(s.mode)}</td><td><span class="badge ${sc >= PASS_SCORE ? "pass" : "fail"}">${sc} 分</span></td><td><a href="#/review/${s.id}">檢討</a></td></tr>`;
  }).join("") : `<tr><td class="empty">還沒有考卷。先去考一回吧。</td></tr>`;
}

function modeName(m) { return { random: "亂數", weak: "弱項加重", wrong_only: "錯題重練" }[m] || m; }

async function speak(bubbleEl, textEl, context, stats, force = false) {
  const key = `teacher:${context}:${localDateStr(new Date())}:${JSON.stringify(stats).length}`;
  let msg = !force ? sessionStorage.getItem(key) : null;
  let mood = null;
  bubbleEl.classList.add("typing");
  textEl.textContent = "";
  if (!msg) {
    try { const r = await api.teacherSay(context, stats); msg = r.message; mood = r.mood; sessionStorage.setItem(key, msg); sessionStorage.setItem(key + ":mood", mood); }
    catch (e) { console.warn(e); msg = "老夫今日嗓子啞了，先去做題吧。"; }
  } else mood = sessionStorage.getItem(key + ":mood");
  if (mood && state.teacher) state.teacher.setMood(mood);
  await typewrite(textEl, msg);
  bubbleEl.classList.remove("typing");
}

async function typewrite(el, text) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) { el.textContent = text; return; }
  el.textContent = "";
  for (const ch of text) { el.textContent += ch; await new Promise(r => setTimeout(r, 28)); }
}

// ============================================================
// 考試設定
// ============================================================
async function viewExamSetup(main) {
  const syl = state.syllabus ??= await api.loadSyllabus();
  const counts = await api.questionCounts();
  const bySubject = {};
  counts.forEach(c => { bySubject[c.subject] = (bySubject[c.subject] || 0) + c.n; });
  const wb = await api.wrongBook();
  const wrongBySubject = {};
  wb.forEach(w => { wrongBySubject[w.subject] = (wrongBySubject[w.subject] || 0) + 1; });

  let level = state.profile.target_level || "L1";
  main.innerHTML = "";
  const card = h(`
    <div class="card ruled">
      <h2>模擬考設定</h2>
      <label>級別</label>
      <div class="choice-row" id="lv">
        <label class="choice ${level === "L1" ? "on" : ""}"><input type="radio" name="lv" value="L1" ${level === "L1" ? "checked" : ""}>初級</label>
        <label class="choice ${level === "L2" ? "on" : ""}"><input type="radio" name="lv" value="L2" ${level === "L2" ? "checked" : ""}>中級</label>
      </div>
      <label>科目（可複選）</label>
      <div class="choice-row" id="subjects"></div>
      <p class="hint" id="subject-hint"></p>
      <label>題數</label>
      <div class="choice-row" id="count">
        <label class="choice"><input type="radio" name="count" value="10">10 題（暖身）</label>
        <label class="choice on"><input type="radio" name="count" value="25" checked>25 題（半卷）</label>
        <label class="choice"><input type="radio" name="count" value="50">50 題（正式一科）</label>
      </div>
      <label>出題方式</label>
      <div class="choice-row" id="mode">
        <label class="choice on"><input type="radio" name="mode" value="random" checked>純亂數</label>
        <label class="choice"><input type="radio" name="mode" value="weak">弱項加重</label>
        <label class="choice"><input type="radio" name="mode" value="wrong_only">只練錯題</label>
      </div>
      <div id="weak-box" hidden>
        <label for="weak">加重比例：<span id="weak-val">50</span>%</label>
        <input id="weak" type="range" min="0" max="100" step="10" value="50">
        <p class="hint">0% 等同純亂數；100% 時，曾答錯的題目與錯誤率高的主題抽中機率最高可達一般題目的 6 倍。</p>
      </div>
      <label>計時</label>
      <div class="choice-row" id="timer">
        <label class="choice on"><input type="radio" name="timer" value="1" checked>依官方節奏計時</label>
        <label class="choice"><input type="radio" name="timer" value="0">不計時</label>
      </div>
      <p class="hint">官方規格：初級每科 50 題 75 分鐘，中級每科 50 題 90 分鐘，各科 70 分及格。本模擬考依題數等比例換算時間。</p>
      <div class="row" style="margin-top:1.25rem"><button class="primary" id="start">開始作答</button><span class="hint" id="start-msg"></span></div>
    </div>`);
  main.appendChild(card);

  const subjectsBox = $("#subjects", card);
  const renderSubjects = () => {
    const subs = syl.levels[level].subjects;
    subjectsBox.innerHTML = Object.entries(subs).map(([k, s], i) => `<label class="choice ${i === 0 ? "on" : ""}"><input type="checkbox" name="sub" value="${k}" ${i === 0 ? "checked" : ""}>${k} ${esc(s.name)} <small>（${bySubject[k] || 0} 題${wrongBySubject[k] ? `・錯 ${wrongBySubject[k]}` : ""}）</small></label>`).join("");
    bindChoiceRow(subjectsBox, { multi: true });
    $("#subject-hint", card).textContent = level === "L2" ? "中級正式考試：L21 必考，L22 與 L23 擇一。" : "初級正式考試兩科皆須通過。";
  };
  renderSubjects();
  bindChoiceRow($("#lv", card));
  $("#lv", card).addEventListener("change", () => { level = card.querySelector("input[name=lv]:checked").value; renderSubjects(); });
  ["#count", "#mode", "#timer"].forEach(s => bindChoiceRow($(s, card)));
  $("#mode", card).addEventListener("change", () => { $("#weak-box", card).hidden = card.querySelector("input[name=mode]:checked").value !== "weak"; });
  $("#weak", card).addEventListener("input", e => { $("#weak-val", card).textContent = e.target.value; });

  $("#start", card).addEventListener("click", async () => {
    const subjects = [...card.querySelectorAll("input[name=sub]:checked")].map(i => i.value);
    const msg = $("#start-msg", card);
    if (!subjects.length) { msg.textContent = "至少選一科。"; return; }
    const count = Number(card.querySelector("input[name=count]:checked").value);
    const mode = card.querySelector("input[name=mode]:checked").value;
    const weakWeight = mode === "weak" ? Number($("#weak", card).value) : 0;
    const timed = card.querySelector("input[name=timer]:checked").value === "1";
    if (mode === "wrong_only" && !subjects.some(s => wrongBySubject[s])) { msg.textContent = "所選科目的錯題本是空的。先考一回再來。"; return; }
    msg.textContent = "出題中…";
    $("#start", card).disabled = true;
    try {
      const { sessionId, questionIds } = await api.startExam({ level, subjects, count, mode, weakWeight });
      const questions = await api.fetchQuestions(questionIds);
      state.exam = {
        sessionId, level, subjects, mode, questions, idx: 0,
        answers: {}, flags: {}, startedAt: Date.now(), qEnteredAt: Date.now(),
        timed, limitSec: timed ? Math.round(questions.length * MINUTES_PER_QUESTION[level] * 60) : 0,
      };
      sessionStorage.setItem("exam", JSON.stringify({ ...state.exam, questions: undefined, questionIds }));
      go("/exam/run");
    } catch (e) { msg.textContent = "出題失敗：" + (e.message || e); $("#start", card).disabled = false; }
  });
}

// ============================================================
// 作答
// ============================================================
async function viewExamRun(main) {
  if (!state.exam) {
    // 重新整理後還原
    const saved = sessionStorage.getItem("exam");
    if (!saved) { go("/exam/setup"); return; }
    const s = JSON.parse(saved);
    s.questions = await api.fetchQuestions(s.questionIds);
    s.qEnteredAt = Date.now();
    state.exam = s;
  }
  const ex = state.exam;
  const syl = state.syllabus ??= await api.loadSyllabus();
  main.innerHTML = "";
  const card = h(`
    <div class="card ruled">
      <div class="exam-head">
        <div class="q-meta"><span>${syl.levels[ex.level].name}・${ex.subjects.join("+")}</span><span>${modeName(ex.mode)}</span><span id="progress"></span></div>
        <div class="timer" id="timer">${ex.timed ? "" : "不計時"}</div>
      </div>
      <div id="q"></div>
      <div class="exam-foot">
        <button class="ghost" id="prev">上一題</button>
        <button class="ghost" id="flag">標記待確認</button>
        <span class="sp"></span>
        <button id="next">下一題</button>
        <button class="primary" id="submit">交卷</button>
      </div>
      <h3 style="margin-top:1.25rem">答題卡</h3>
      <div class="navgrid" id="navgrid"></div>
    </div>`);
  main.appendChild(card);

  const persist = () => sessionStorage.setItem("exam", JSON.stringify({ ...ex, questions: undefined, questionIds: ex.questions.map(q => q.id) }));
  const trackTime = () => {
    const q = ex.questions[ex.idx];
    const a = ex.answers[q.id] ||= { chosen: null, time: 0 };
    a.time += (Date.now() - ex.qEnteredAt) / 1000;
    ex.qEnteredAt = Date.now();
  };

  const renderQ = () => {
    const q = ex.questions[ex.idx];
    const a = ex.answers[q.id] || {};
    const topicName = syl.levels[ex.level].subjects[q.subject]?.topics?.[q.topic]?.name || q.topic;
    $("#progress", card).textContent = `第 ${ex.idx + 1} / ${ex.questions.length} 題`;
    $("#q", card).innerHTML = `
      <div class="q-meta"><span>${q.id}</span><span>${esc(topicName)}</span><span>難度 ${"★".repeat(q.difficulty)}${"☆".repeat(3 - q.difficulty)}</span></div>
      <p class="q-text">${esc(q.question)}</p>
      <div class="options">${["A", "B", "C", "D"].map(k => `<button class="opt ${a.chosen === k ? "chosen" : ""}" data-k="${k}"><span class="k">${k}</span><span>${esc(q.options[k])}</span></button>`).join("")}</div>`;
    $("#q", card).querySelectorAll(".opt").forEach(b => b.addEventListener("click", () => {
      trackTime();
      ex.answers[q.id].chosen = b.dataset.k;
      persist(); renderQ(); renderNav();
    }));
    $("#prev", card).disabled = ex.idx === 0;
    $("#next", card).disabled = ex.idx === ex.questions.length - 1;
    $("#flag", card).textContent = ex.flags[q.id] ? "取消標記" : "標記待確認";
  };
  const renderNav = () => {
    $("#navgrid", card).innerHTML = ex.questions.map((q, i) => `<button class="${ex.answers[q.id]?.chosen ? "answered" : ""} ${ex.flags[q.id] ? "flagged" : ""} ${i === ex.idx ? "current" : ""}" data-i="${i}" title="第 ${i + 1} 題">${i + 1}</button>`).join("");
    $("#navgrid", card).querySelectorAll("button").forEach(b => b.addEventListener("click", () => { trackTime(); ex.idx = Number(b.dataset.i); renderQ(); renderNav(); }));
  };
  $("#prev", card).onclick = () => { trackTime(); ex.idx--; renderQ(); renderNav(); };
  $("#next", card).onclick = () => { trackTime(); ex.idx++; renderQ(); renderNav(); };
  $("#flag", card).onclick = () => { const q = ex.questions[ex.idx]; ex.flags[q.id] = !ex.flags[q.id]; persist(); renderQ(); renderNav(); };
  document.onkeydown = (e) => {
    if (!state.exam || !location.hash.startsWith("#/exam/run")) return;
    if (["a", "b", "c", "d", "1", "2", "3", "4"].includes(e.key.toLowerCase())) { const k = "ABCD"["abcd1234".indexOf(e.key.toLowerCase()) % 4]; $(`.opt[data-k=${k}]`, card)?.click(); }
    if (e.key === "ArrowRight" && !$("#next", card).disabled) $("#next", card).click();
    if (e.key === "ArrowLeft" && !$("#prev", card).disabled) $("#prev", card).click();
  };

  // 計時
  let tick = null;
  if (ex.timed) {
    const timerEl = $("#timer", card);
    const update = () => {
      const left = ex.limitSec - Math.floor((Date.now() - ex.startedAt) / 1000);
      if (left <= 0) { clearInterval(tick); timerEl.textContent = "時間到"; doSubmit(true); return; }
      const m = Math.floor(left / 60), s = left % 60;
      timerEl.textContent = `⏱ ${m}:${String(s).padStart(2, "0")}`;
      timerEl.classList.toggle("low", left < 120);
    };
    update(); tick = setInterval(update, 1000);
  }

  const doSubmit = async (auto = false) => {
    trackTime();
    const unanswered = ex.questions.filter(q => !ex.answers[q.id]?.chosen).length;
    if (!auto && unanswered && !confirm(`還有 ${unanswered} 題未作答，確定交卷？未作答以答錯計。`)) return;
    clearInterval(tick);
    document.onkeydown = null;
    $("#submit", card).disabled = true; $("#submit", card).textContent = "送出中…";
    try {
      // 逐題送到資料庫批改（並行 8 題一批）
      const marks = new Array(ex.questions.length).fill(null);
      const items = ex.questions.map((q, i) => ({ q, i })).filter(x => ex.answers[x.q.id]?.chosen);
      for (let b = 0; b < items.length; b += 8) {
        await Promise.all(items.slice(b, b + 8).map(async ({ q, i }) => {
          const a = ex.answers[q.id];
          const r = await api.submitAnswer(ex.sessionId, q.id, a.chosen, a.time);
          marks[i] = { ok: !!r.is_correct };
        }));
      }
      for (let i = 0; i < marks.length; i++) if (!marks[i]) marks[i] = { ok: false };
      const fin = await api.finishExam(ex.sessionId);
      sessionStorage.removeItem("exam");
      const sid = ex.sessionId;
      state.exam = null;
      await playGrading({
        score: Number(fin.score || 0), passed: !!fin.passed, marks,
        studentName: state.profile.display_name,
        title: `iPAS AI應用規劃師 ${syl.levels[ex.level].name} ${ex.subjects.join("+")} 模擬試卷`,
      });
      go(`/result/${sid}`);
    } catch (e) {
      alert("交卷失敗：" + (e.message || e));
      $("#submit", card).disabled = false; $("#submit", card).textContent = "交卷";
    }
  };
  $("#submit", card).onclick = () => doSubmit(false);

  renderQ(); renderNav();
}

// ============================================================
// 結果頁
// ============================================================
async function viewResult(main, sessionId) {
  if (!sessionId) { go("/history"); return; }
  const syl = state.syllabus ??= await api.loadSyllabus();
  const review = await api.sessionReview(sessionId);
  const sessions = await api.listSessions(50);
  const s = sessions.find(x => x.id === sessionId);
  if (!s) { main.innerHTML = `<div class="card"><p>找不到這份考卷。</p></div>`; return; }
  const lv = syl.levels[s.level];
  const total = review.length, correct = review.filter(r => r.is_correct).length;
  const score = Math.round(100 * correct / total);
  const passed = score >= PASS_SCORE;

  // 面向統計
  const dimStat = {};
  review.forEach(r => { const d = dimStat[r.dimension] ||= { n: 0, c: 0 }; d.n++; if (r.is_correct) d.c++; });
  const topicStat = {};
  review.forEach(r => { const d = topicStat[r.topic] ||= { n: 0, c: 0 }; d.n++; if (r.is_correct) d.c++; });
  const worstTopics = Object.entries(topicStat).filter(([, v]) => v.n - v.c > 0).sort((a, b) => (b[1].n - b[1].c) - (a[1].n - a[1].c)).slice(0, 3);
  const topicName = (t) => { for (const sub of Object.values(lv.subjects)) if (sub.topics[t]) return `${t} ${sub.topics[t].name}`; return t; };

  main.innerHTML = "";
  const wrap = h(`
    <div>
      <div class="card board">
        <div class="teacher-stage">
          <canvas class="teacher"></canvas>
          <div class="bubble typing" id="bubble"><span class="who">老學究老師</span><span id="bubble-text"></span></div>
        </div>
      </div>
      <div class="grid two" style="margin-top:1.5rem">
        <div class="card ruled">
          <h2>成績單</h2>
          <div class="row"><span class="score-big">${score} 分</span><span class="badge ${passed ? "pass" : "fail"}">${passed ? "達及格線" : "未達 70 分"}</span></div>
          <p class="muted">${lv.name}・${s.subjects.join("+")}・${modeName(s.mode)}・答對 ${correct}/${total}・用時 ${fmtDuration(s.duration_sec)}</p>
          <h3>各面向表現</h3>
          <ul class="dim-bars">${lv.dimensions.map(d => { const st = dimStat[d.key]; if (!st) return ""; const pct = Math.round(100 * st.c / st.n); return `<li><span>${esc(d.name)}</span><div class="bar"><i class="${pct >= PASS_SCORE ? "good" : ""}" style="width:${pct}%"></i></div><span class="right">${pct}%</span></li>`; }).join("")}</ul>
          ${worstTopics.length ? `<h3 style="margin-top:1rem">這次最常失分</h3><ul>${worstTopics.map(([t, v]) => `<li>・${esc(topicName(t))}：錯 ${v.n - v.c} / ${v.n}</li>`).join("")}</ul>` : `<p>全對，無失分主題。</p>`}
          <div class="row" style="margin-top:1.25rem">
            <button class="primary" data-go="/review/${sessionId}">逐題檢討（${total - correct} 題錯）</button>
            <button class="ghost" data-go="/exam/setup">再考一回</button>
            <button class="ghost" data-go="/">回書齋</button>
          </div>
        </div>
        <div class="card">
          <h2>答題總覽</h2>
          <div class="navgrid" id="overview"></div>
          <p class="hint" style="margin-top:.75rem">深色＝答對、紅框＝答錯、空白＝未作答。點選可跳到該題檢討。</p>
        </div>
      </div>
    </div>`);
  main.appendChild(wrap);
  wrap.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => go(b.dataset.go)));
  $("#overview", wrap).innerHTML = review.map((r, i) => `<button class="${r.is_correct ? "answered" : r.chosen ? "flagged" : ""}" title="${r.question_id}" data-i="${i}">${i + 1}</button>`).join("");
  $("#overview", wrap).querySelectorAll("button").forEach(b => b.addEventListener("click", () => { location.hash = `#/review/${sessionId}`; sessionStorage.setItem("review-jump", b.dataset.i); }));

  state.teacher = mountTeacher($("canvas.teacher", wrap), passed ? "proud" : score >= 50 ? "worried" : "stern");
  speak($("#bubble", wrap), $("#bubble-text", wrap), "result", {
    display_name: state.profile.display_name, score, passed, total, correct, level: lv.name, subjects: s.subjects, mode: s.mode,
    duration_minutes: Math.round(s.duration_sec / 60),
    worst_topics: worstTopics.map(([t, v]) => ({ topic: topicName(t), wrong: v.n - v.c, of: v.n })),
    dimensions: lv.dimensions.map(d => ({ name: d.name, pct: dimStat[d.key] ? Math.round(100 * dimStat[d.key].c / dimStat[d.key].n) : null })),
  }, true);
}

// ============================================================
// 逐題檢討（錯題學習）
// ============================================================
function analysisBlock(r, lv) {
  const topicName = (t) => { for (const sub of Object.values(lv.subjects)) if (sub.topics[t]) return sub.topics[t].name; return t; };
  const indName = (t, i) => { for (const sub of Object.values(lv.subjects)) if (sub.topics[t]?.indicators?.[i]) return sub.topics[t].indicators[i]; return i; };
  return `
    <div class="q-meta"><span>${r.question_id}</span><span>${esc(topicName(r.topic))}</span><span>${r.indicator}</span><span>難度 ${"★".repeat(r.difficulty)}</span>
      ${r.chosen ? `<span class="${r.is_correct ? "" : ""}" style="color:${r.is_correct ? "var(--ok)" : "var(--red)"}">${r.is_correct ? "答對" : `答錯（你選 ${r.chosen}）`}</span>` : `<span style="color:var(--red)">未作答</span>`}</div>
    <p class="q-text">${esc(r.question)}</p>
    <div class="options">${["A", "B", "C", "D"].map(k => `<div class="opt ${k === r.answer ? "correct" : k === r.chosen ? "wrong" : ""}"><span class="k">${k}</span><span>${esc(r.options[k])}</span></div>`).join("")}</div>
    <div class="analysis">
      <p><b>正解 ${r.answer}</b>　${esc(r.explanation)}</p>
      <h3>逐選項解析</h3>
      ${["A", "B", "C", "D"].map(k => `<div class="opt-ana ${k === r.answer ? "is-right" : ""} ${k === r.chosen && k !== r.answer ? "picked" : ""}"><span class="k">${k}</span><span>${esc(r.option_analysis?.[k] || "")}</span></div>`).join("")}
      <p class="hint" style="margin-top:.5rem">能力指標：${esc(indName(r.topic, r.indicator))}</p>
      <div class="keywords">${(r.keywords || []).map(k => `<span>${esc(k)}</span>`).join("")}</div>
    </div>`;
}

async function viewReview(main, sessionId) {
  const syl = state.syllabus ??= await api.loadSyllabus();
  const review = await api.sessionReview(sessionId);
  const sessions = await api.listSessions(50);
  const s = sessions.find(x => x.id === sessionId);
  const lv = syl.levels[s?.level || "L1"];
  let onlyWrong = true;
  main.innerHTML = "";
  const wrap = h(`
    <div>
      <div class="card board">
        <div class="teacher-stage">
          <canvas class="teacher"></canvas>
          <div class="bubble typing" id="bubble"><span class="who">老學究老師</span><span id="bubble-text"></span></div>
        </div>
      </div>
      <div class="filterbar" style="margin-top:1.5rem">
        <button class="small ghost on" id="f-wrong">只看錯題</button><button class="small ghost" id="f-all">全部題目</button>
        <span class="sp"></span><button class="small ghost" data-go="/result/${sessionId}">回成績單</button>
      </div>
      <div id="list"></div>
    </div>`);
  main.appendChild(wrap);
  wrap.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => go(b.dataset.go)));
  state.teacher = mountTeacher($("canvas.teacher", wrap), "neutral");
  speak($("#bubble", wrap), $("#bubble-text", wrap), "wrong_review", { display_name: state.profile.display_name, wrong: review.filter(r => !r.is_correct).length, total: review.length });

  const render = () => {
    const items = review.filter(r => !onlyWrong || !r.is_correct);
    $("#list", wrap).innerHTML = items.length ? items.map(r => `<div class="card ruled review-item" id="q-${r.ord}">${analysisBlock(r, lv)}</div>`).join("") : `<div class="card"><p class="empty">這份考卷沒有錯題。</p></div>`;
    $("#f-wrong", wrap).classList.toggle("on", onlyWrong); $("#f-all", wrap).classList.toggle("on", !onlyWrong);
  };
  $("#f-wrong", wrap).onclick = () => { onlyWrong = true; render(); };
  $("#f-all", wrap).onclick = () => { onlyWrong = false; render(); };
  render();
  const jump = sessionStorage.getItem("review-jump");
  if (jump != null) { sessionStorage.removeItem("review-jump"); onlyWrong = false; render(); document.getElementById(`q-${Number(jump) + 1}`)?.scrollIntoView({ behavior: "smooth" }); }
}

// ============================================================
// 錯題本
// ============================================================
async function viewWrongBook(main) {
  const syl = state.syllabus ??= await api.loadSyllabus();
  const level = state.profile.target_level || "L1";
  const lv = syl.levels[level];
  const wb = await api.wrongBook(level);
  main.innerHTML = "";
  const wrap = h(`
    <div>
      <div class="card ruled">
        <div class="row"><h2 style="margin:0">錯題本・${lv.name}</h2><span class="sp"></span><span class="pixel">${wb.length} 題待克服</span>
          <button class="primary small" id="drill" ${wb.length ? "" : "disabled"}>錯題重練 10 題</button></div>
        <p class="hint">這裡列出「最近一次仍答錯」的題目。再考一次答對，它就會從錯題本畢業。點題目展開逐選項解析。</p>
        <div class="filterbar" id="topics"></div>
        <div id="list"></div>
      </div>
    </div>`);
  main.appendChild(wrap);
  $("#drill", wrap).onclick = async () => {
    try {
      const subjects = [...new Set(wb.map(w => w.subject))];
      const { sessionId, questionIds } = await api.startExam({ level, subjects, count: Math.min(10, wb.length), mode: "wrong_only", weakWeight: 0 });
      const questions = await api.fetchQuestions(questionIds);
      state.exam = { sessionId, level, subjects, mode: "wrong_only", questions, idx: 0, answers: {}, flags: {}, startedAt: Date.now(), qEnteredAt: Date.now(), timed: false, limitSec: 0 };
      sessionStorage.setItem("exam", JSON.stringify({ ...state.exam, questions: undefined, questionIds }));
      go("/exam/run");
    } catch (e) { alert(e.message || e); }
  };
  const topics = [...new Set(wb.map(w => w.topic))].sort();
  let filter = null;
  const topicName = (t) => { for (const sub of Object.values(lv.subjects)) if (sub.topics[t]) return sub.topics[t].name; return t; };
  const renderTopics = () => {
    $("#topics", wrap).innerHTML = [`<button class="small ghost ${filter == null ? "on" : ""}" data-t="">全部</button>`, ...topics.map(t => `<button class="small ghost ${filter === t ? "on" : ""}" data-t="${t}">${t} ${esc(topicName(t))}（${wb.filter(w => w.topic === t).length}）</button>`)].join("");
    $("#topics", wrap).querySelectorAll("button").forEach(b => b.onclick = () => { filter = b.dataset.t || null; renderTopics(); renderList(); });
  };
  const renderList = () => {
    const items = wb.filter(w => !filter || w.topic === filter);
    const box = $("#list", wrap);
    box.innerHTML = items.length ? "" : `<p class="empty">錯題本是空的。老夫很欣慰。</p>`;
    items.forEach(w => {
      const item = h(`<details class="review-item"><summary style="cursor:pointer"><span class="q-meta" style="display:inline-flex"><span>${w.question_id}</span><span>${esc(topicName(w.topic))}</span><span>錯 ${w.times_wrong} 次 / 看過 ${w.times_seen} 次</span></span><br>${esc(w.question)}</summary><div class="body"><p class="loading">載入解析</p></div></details>`);
      item.addEventListener("toggle", async () => {
        if (!item.open || item.dataset.loaded) return;
        item.dataset.loaded = "1";
        const q = await api.questionReview(w.question_id);
        $(".body", item).innerHTML = analysisBlock({ ...q, question_id: q.id, chosen: w.last_chosen, is_correct: false }, lv);
      });
      box.appendChild(item);
    });
  };
  renderTopics(); renderList();
}

// ============================================================
// 成績簿
// ============================================================
async function viewHistory(main) {
  const sessions = (await api.listSessions(60)).filter(s => s.status === "finished");
  main.innerHTML = "";
  const wrap = h(`<div class="card ruled"><h2>成績簿</h2><table class="sessions" style="width:100%"><thead><tr><th>日期</th><th>級別</th><th>科目</th><th>方式</th><th>題數</th><th>分數</th><th>用時</th><th></th></tr></thead><tbody></tbody></table></div>`);
  main.appendChild(wrap);
  $("tbody", wrap).innerHTML = sessions.length ? sessions.map(s => {
    const sc = Math.round(100 * s.correct / s.total);
    return `<tr><td>${new Date(s.started_at).toLocaleString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</td><td>${s.level === "L1" ? "初級" : "中級"}</td><td>${s.subjects.join("+")}</td><td>${modeName(s.mode)}</td><td>${s.total}</td><td><span class="badge ${sc >= PASS_SCORE ? "pass" : "fail"}">${sc}</span></td><td>${fmtDuration(s.duration_sec)}</td><td><a href="#/result/${s.id}">成績單</a>・<a href="#/review/${s.id}">檢討</a></td></tr>`;
  }).join("") : `<tr><td colspan="8" class="empty">還沒有成績。</td></tr>`;
}

// ============================================================
// 學籍（個人設定）
// ============================================================
async function viewProfile(main) {
  const p = state.profile;
  main.innerHTML = "";
  const wrap = h(`
    <div class="card ruled" style="max-width:640px">
      <h2>學籍資料</h2>
      <label for="name">稱呼</label><input id="name" type="text" maxlength="20" value="${esc(p.display_name)}">
      <label>頭像</label><div class="avatar-pick" id="avatar"></div>
      <label>目標級別（影響書齋的五力圖與錯題本）</label>
      <div class="choice-row" id="lv">
        <label class="choice ${p.target_level === "L1" ? "on" : ""}"><input type="radio" name="lv" value="L1" ${p.target_level === "L1" ? "checked" : ""}>初級</label>
        <label class="choice ${p.target_level === "L2" ? "on" : ""}"><input type="radio" name="lv" value="L2" ${p.target_level === "L2" ? "checked" : ""}>中級</label>
      </div>
      <label for="exam-date">預計應試日（選填）</label><input id="exam-date" type="date" value="${p.exam_date || ""}">
      <div class="row" style="margin-top:1.25rem"><button class="primary" id="save">儲存</button><span class="hint" id="msg"></span></div>
      <p class="hint" style="margin-top:1.5rem">帳號：${esc(state.session.user.email)}</p>
    </div>`);
  main.appendChild(wrap);
  let avatar = p.avatar || "cat";
  AVATAR_KEYS.forEach(k => {
    const lab = h(`<label class="choice ${k === avatar ? "on" : ""}" title="${AVATAR_NAMES[k]}"><canvas></canvas></label>`);
    drawAvatar($("canvas", lab), k);
    lab.addEventListener("click", () => { avatar = k; wrap.querySelectorAll("#avatar .choice").forEach(c => c.classList.remove("on")); lab.classList.add("on"); });
    $("#avatar", wrap).appendChild(lab);
  });
  bindChoiceRow($("#lv", wrap));
  $("#save", wrap).onclick = async () => {
    const patch = { display_name: $("#name", wrap).value.trim() || "考生", avatar, target_level: wrap.querySelector("input[name=lv]:checked").value, exam_date: $("#exam-date", wrap).value || null };
    try { await api.updateProfile(patch); state.profile = { ...p, ...patch }; $("#msg", wrap).textContent = "已儲存"; renderTopbar("/profile"); }
    catch (e) { $("#msg", wrap).textContent = "儲存失敗：" + e.message; }
  };
}

// ============================================================
// 題庫管理（admin）
// ============================================================
async function viewAdmin(main) {
  if (!state.profile?.is_admin) { go("/"); return; }
  const counts = await api.questionCounts();
  main.innerHTML = "";
  const wrap = h(`
    <div class="card ruled">
      <h2>題庫管理</h2>
      <p class="hint">目前題數：${Object.entries(counts.reduce((m, c) => { m[c.subject] = (m[c.subject] || 0) + c.n; return m; }, {})).map(([k, v]) => `${k} ${v}`).join("、")}</p>
      <label for="file">匯入題庫 JSON（格式見 data/QUESTION_SCHEMA.md；同 id 會覆寫）</label>
      <input id="file" type="file" accept="application/json" multiple>
      <div class="row" style="margin-top:1rem"><button class="primary" id="import">匯入</button><span id="msg" class="hint"></span></div>
      <pre id="log" style="font-size:.8rem;white-space:pre-wrap"></pre>
    </div>`);
  main.appendChild(wrap);
  $("#import", wrap).onclick = async () => {
    const files = [...$("#file", wrap).files];
    if (!files.length) { $("#msg", wrap).textContent = "先選檔案。"; return; }
    for (const f of files) {
      try {
        const arr = JSON.parse(await f.text());
        const r = await api.importQuestions(arr);
        $("#log", wrap).textContent += `${f.name} → ${JSON.stringify(r)}\n`;
      } catch (e) { $("#log", wrap).textContent += `${f.name} → 失敗：${e.message}\n`; }
    }
    $("#msg", wrap).textContent = "完成";
  };
}

// ============================================================
// 啟動
// ============================================================
window.addEventListener("hashchange", router);
api.sb.auth.onAuthStateChange((evt) => { if (evt === "SIGNED_OUT") { state.profile = null; } });
document.title = APP_NAME;
router();
