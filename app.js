import { store } from "./store.js";

const app = document.getElementById("app");
const toastEl = document.getElementById("toast");
let toastTimer = 0;

const TYPE_NAME = { fill: "填空题", choice: "单选题", judge: "判断题" };

const S = {
  view: "home",
  boot: null,
  session: null,
  answered: false,
  submitting: false,
  last: null,
  wrongList: null,
  adminToken: localStorage.getItem("fx_admin") || "",
  admin: { tab: "review", pending: null, kps: null, summary: null, loading: false },
  pin: "",
};

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2400);
}
function prettyStem(q) {
  return esc(q.stem).replace(/＿＿＿＿/g, '<span class="blank"></span>');
}

// 本地数据层，保持和原来 /api/* 一样的调用形态
async function api(path, opts) {
  const body = opts && opts.body ? JSON.parse(opts.body) : {};
  switch (path) {
    case "/api/bootstrap": return store.bootstrap();
    case "/api/stats": return store.stats();
    case "/api/session": return { questions: await store.createSession(body) };
    case "/api/answer": return store.submitAnswer(body.qid, body.answer);
    case "/api/wrong": return { list: await store.getWrong() };
    case "/api/recite/session": return { questions: await store.reciteSession(body.lessonId) };
    case "/api/recite/answer": return store.reciteAnswer(body);
    case "/api/admin/login": return store.login(body.pin);
    case "/api/admin/pending": return { list: await store.listPending() };
    case "/api/admin/question": return store.setStatus(body.id, body.status);
    case "/api/admin/kps": return { list: await store.listKps() };
    case "/api/admin/kp": return store.setImportant(body.id, body.important);
    case "/api/admin/summary": return store.summary();
    case "/api/admin/pin": return store.setPin(body.pin);
    case "/api/admin/import": return store.importData(body.data, { replace: body.replace !== false });
    case "/api/admin/export": return store.exportData();
    case "/api/admin/reset": return store.reset();
    default: throw new Error("未知操作：" + path);
  }
}

function render() {
  let html = "";
  if (S.view === "home") html = viewHome();
  else if (S.view === "quiz") html = viewQuiz();
  else if (S.view === "result") html = viewResult();
  else if (S.view === "wrong") html = viewWrong();
  else if (S.view === "rush") html = viewRush();
  else if (S.view === "recite") html = viewRecite();
  else if (S.view === "admin") html = viewAdmin();
  app.innerHTML = html;
  if (S.view === "quiz") {
    const input = document.getElementById("fillInput");
    if (input && !input.disabled) input.focus();
  }
}

// ---------- 首页 ----------
function viewHome() {
  if (!S.boot) return '<div class="loading">加载中…</div>';
  const st = S.boot.stats;
  const meta = S.boot.meta;
  const rate = st.todayDone ? Math.round((st.todayCorrect / st.todayDone) * 100) : 0;

  if (!st.totalQuestions) {
    return (
      '<div class="header"><div class="brand">每日一练</div>' +
        '<div class="sub">还没有题库</div></div>' +
      '<div class="card" style="padding:22px;text-align:center">' +
        '<div class="sub" style="margin:0 0 16px;line-height:1.8">' +
          "第一次使用，先导入题库文件。<br>家长模式 → 题库管理 → 选择 JSON 文件。" +
        "</div>" +
        '<button class="primary" data-act="admin">进入家长模式</button>' +
      "</div>"
    );
  }

  const lessonBtns = S.boot.lessons
    .filter((l) => l.count > 0)
    .map((l) =>
      '<button class="lesson-item" data-act="lesson" data-id="' + esc(l.id) + '">' +
        "<span>" + esc(l.title) + "</span>" +
        '<span class="count">' + l.count + " 题 ›</span>" +
      "</button>"
    )
    .join("");

  return (
    '<div class="header">' +
      '<div class="brand">每日一练</div>' +
      '<div class="sub">' + esc(meta.subject || "") + " · " + esc(meta.grade || "") + esc(meta.volume || "") + "</div>" +
    "</div>" +
    '<div class="card stats">' +
      '<div class="stat"><b>' + st.todayDone + "</b><span>今日已做</span></div>" +
      '<div class="stat"><b>' + rate + "%</b><span>今日正确率</span></div>" +
      '<div class="stat"><b>' + st.wrongCount + "</b><span>错题待复习</span></div>" +
    "</div>" +
    '<button class="primary" data-act="daily">开始今日练习 · 10 题</button>' +
    '<button class="secondary" data-act="recite">背书模式 · 按课背</button>' +
    '<button class="secondary" data-act="rush">考前冲刺</button>' +
    '<button class="btn-ghost" data-act="wrong">错题本' + (st.wrongCount ? "（" + st.wrongCount + "）" : "") + "</button>" +
    '<div class="section-title">按课练习</div>' +
    '<div class="lesson-list">' + lessonBtns + "</div>" +
    '<div class="footer">' +
      esc(meta.source || "") + "<br>共 " + st.totalQuestions + " 道题 · 掌握 " + st.mastered + "/" + st.totalKp + " 个知识点" +
      '<br><button class="btn-ghost" data-act="admin" style="margin-top:6px">家长模式</button>' +
    "</div>"
  );
}

// ---------- 冲刺 ----------
function viewRush() {
  if (!S.boot) return '<div class="loading">加载中…</div>';
  const opts = S.boot.lessons
    .filter((l) => l.count > 0)
    .map((l) => '<option value="' + esc(l.id) + '">第' + l.no + "课 " + esc(l.title) + "</option>")
    .join("");
  return (
    '<div class="topbar"><button class="icon-btn" data-act="home">‹</button>' +
      '<div style="font-weight:700">考前冲刺</div><div style="width:38px"></div></div>' +
    '<div class="card" style="padding:20px">' +
      '<div class="sub" style="margin:0 0 14px">优先出错题和标记了「重点」的知识点，一次 20 题。</div>' +
      '<select id="rushLesson" class="fill-input" style="width:100%;letter-spacing:0;text-align:left;font-size:16px">' +
        '<option value="">全部课程</option>' + opts +
      "</select>" +
      '<button class="primary" data-act="rush-start">开始冲刺 · 20 题</button>' +
    "</div>"
  );
}

// ---------- 背书 ----------
function viewRecite() {
  if (!S.boot) return '<div class="loading">加载中…</div>';
  const list = S.boot.lessons
    .filter((l) => l.items > 0)
    .map((l) =>
      '<button class="lesson-item" data-act="recite-start" data-id="' + esc(l.id) + '">' +
        "<span>第" + l.no + "课 " + esc(l.title) + "</span>" +
        '<span class="count">' + l.items + " 条 ›</span></button>"
    )
    .join("");
  return (
    '<div class="topbar"><button class="icon-btn" data-act="home">‹</button>' +
      '<div style="font-weight:700">背书模式</div><div style="width:38px"></div></div>' +
    '<div class="card" style="padding:16px;margin-bottom:18px">' +
      '<div class="sub" style="margin:0;line-height:1.7">选一课，把这一课的知识点逐条背一遍。<br>每次进入，挖空的位置都会重新随机。</div>' +
    "</div>" +
    '<div class="lesson-list">' + (list || '<div class="empty">没有可背的内容</div>') + "</div>" +
    '<button class="secondary" data-act="home">回首页</button>'
  );
}

// ---------- 练习 ----------
function viewQuiz() {
  const se = S.session;
  const q = se.qs[se.idx];
  if (!q) return viewResult();
  const pct = Math.round((se.idx / se.qs.length) * 100);
  const disabled = S.answered || S.submitting;

  let body = "";
  if (q.type === "choice") {
    body = '<div class="options">' + q.options.map((o, i) => {
      let cls = "opt";
      if (S.answered && S.last) {
        if (i === S.last.answerIndex) cls += " correct";
        else if (i === S.last.userAnswer) cls += " wrong";
      }
      return '<button class="' + cls + '" data-act="opt" data-i="' + i + '" ' + (disabled ? "disabled" : "") + ">" +
        '<span class="key">' + "ABCD"[i] + "</span><span>" + esc(o) + "</span></button>";
    }).join("") + "</div>";
  } else if (q.type === "fill") {
    const val = S.answered && S.last ? esc(S.last.userAnswer) : "";
    body =
      '<div class="fill-row">' +
        '<input class="fill-input" id="fillInput" autocomplete="off" placeholder="输入关键词" value="' + val + '" ' +
          (disabled ? "disabled" : "") + ">" +
        '<button class="fill-submit" data-act="fill-submit" ' + (disabled ? "disabled" : "") + ">" +
          (S.submitting ? "…" : "提交") + "</button>" +
      "</div>" +
      '<div class="hint">填关键词即可，不用写整句</div>';
  } else {
    body = '<div class="judge-row">' +
      '<button class="judge right" data-act="judge" data-v="1" ' + (disabled ? "disabled" : "") + ">✓ 正确</button>" +
      '<button class="judge wrong" data-act="judge" data-v="0" ' + (disabled ? "disabled" : "") + ">✗ 错误</button>" +
      "</div>";
  }

  return (
    '<div class="topbar">' +
      '<button class="icon-btn" data-act="quit">×</button>' +
      '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
      '<span class="counter">' + (se.idx + 1) + " / " + se.qs.length + "</span>" +
    "</div>" +
    '<div class="card quiz-card">' +
      '<div class="meta"><span class="tag">' + TYPE_NAME[q.type] + "</span>" +
        '<span class="tag ghost">' + esc(q.lesson) + "</span>" +
        (se.mode === "recite"
          ? '<span class="tag hot">背书</span>'
          : q.important ? '<span class="tag hot">重点</span>' : "") + "</div>" +
      '<div class="stem">' + prettyStem(q) + "</div>" +
      body +
    "</div>" +
    (S.answered && S.last ? feedbackHtml(q) : "") +
    (S.answered ? '<button class="primary" data-act="next">' +
      (se.idx + 1 >= se.qs.length ? "查看结果" : "下一题") + "</button>" : "")
  );
}

function feedbackHtml() {
  const ok = S.last && S.last.correct;
  return (
    '<div class="feedback ' + (ok ? "ok" : "bad") + '">' +
      '<div class="fb-title">' + (ok ? "✓ 回答正确" : "✗ 回答错误") + "</div>" +
      '<div class="fb-answer">正确答案：<b>' + esc(S.last.answerText) + "</b></div>" +
      '<div class="fb-explain">' + esc(S.last.explain) + "</div>" +
      '<div class="fb-source">出处：' + esc(S.last.lesson) + " · " + esc(S.last.point) + "</div>" +
    "</div>"
  );
}

// ---------- 结果 ----------
function viewResult() {
  const se = S.session;
  if (!se) return viewHome();
  const total = se.answers.length;
  const right = se.answers.filter((a) => a.correct).length;
  const rate = total ? Math.round((right / total) * 100) : 0;
  const secs = Math.max(0, Math.round((Date.now() - se.startedAt) / 1000));
  const mm = Math.floor(secs / 60), ss = secs % 60;
  const wrongs = se.answers.filter((a) => !a.correct);

  return (
    '<div class="card result">' +
      '<div class="big">' + rate + "<small>%</small></div>" +
      '<div class="result-sub">做对 ' + right + " / " + total + " 题 · 用时 " +
        mm + ":" + (ss < 10 ? "0" : "") + ss + "</div>" +
    "</div>" +
    (wrongs.length
      ? '<div class="section-title">本次错题（' + wrongs.length + "）</div>" +
        '<div class="wrong-list">' + wrongs.map((a) =>
          '<div class="wrong-item">' +
            '<div class="pt">' + esc(a.lesson) + " · " + esc(a.point) + "</div>" +
            '<div class="qs">' + esc(a.stem).replace(/＿＿＿＿/g, '<span class="blank"></span>') + "</div>" +
            '<div class="ans">答案：' + esc(a.answerText) + "</div>" +
          "</div>"
        ).join("") + "</div>"
      : '<div class="empty">全对，厉害！</div>') +
    '<button class="primary" data-act="again">' + (se.mode === "recite" ? "再背一遍" : "再来一组") + "</button>" +
    '<button class="secondary" data-act="home">回首页</button>'
  );
}

// ---------- 错题本 ----------
function viewWrong() {
  if (!S.wrongList) return '<div class="loading">加载中…</div>';
  const list = S.wrongList;
  return (
    '<div class="topbar"><button class="icon-btn" data-act="home">‹</button>' +
      '<div style="font-weight:700">错题本</div><div style="width:38px"></div></div>' +
    (list.length
      ? '<div class="wrong-list">' + list.map((q) =>
          '<div class="wrong-item">' +
            '<div class="pt">' + esc(q.lesson) + " · " + esc(q.point) + " · " + TYPE_NAME[q.type] + "</div>" +
            '<div class="qs">' + prettyStem(q) + "</div>" +
            '<div class="ans">答案：' + esc(q.answerText) + "</div>" +
          "</div>"
        ).join("") + "</div>" +
        '<button class="primary" data-act="wrong-retry">重练这些错题</button>'
      : '<div class="empty">错题本是空的，先去做几道题吧。</div>') +
    '<button class="secondary" data-act="home">回首页</button>'
  );
}

// ---------- 家长模式 ----------
function viewAdmin() {
  if (!S.adminToken) {
    return (
      '<div class="topbar"><button class="icon-btn" data-act="home">‹</button>' +
        '<div style="font-weight:700">家长模式</div><div style="width:38px"></div></div>' +
      '<div class="card" style="padding:24px;text-align:center">' +
        '<div class="sub" style="margin:0 0 6px">输入 4 位家长密码</div>' +
        '<div class="form-row">' +
          '<input class="pin-input" id="pinInput" inputmode="numeric" maxlength="4" placeholder="····" value="' + esc(S.pin) + '">' +
          '<button class="fill-submit" data-act="pin-login">进入</button>' +
        "</div>" +
        '<div class="hint" style="text-align:left">初始密码 1234，进来后可改。</div>' +
      "</div>"
    );
  }

  const tab = S.admin.tab;
  let body = "";
  if (S.admin.loading) body = '<div class="loading">加载中…</div>';
  else if (tab === "review") body = adminReview();
  else if (tab === "kps") body = adminKps();
  else if (tab === "report") body = adminReport();
  else body = adminData();

  return (
    '<div class="topbar"><button class="icon-btn" data-act="home">‹</button>' +
      '<div style="font-weight:700">家长模式</div><div style="width:38px"></div></div>' +
    '<div class="tabs">' +
      '<button class="tab ' + (tab === "review" ? "active" : "") + '" data-act="admin-tab" data-tab="review">审核</button>' +
      '<button class="tab ' + (tab === "kps" ? "active" : "") + '" data-act="admin-tab" data-tab="kps">重点</button>' +
      '<button class="tab ' + (tab === "report" ? "active" : "") + '" data-act="admin-tab" data-tab="report">报告</button>' +
      '<button class="tab ' + (tab === "data" ? "active" : "") + '" data-act="admin-tab" data-tab="data">题库</button>' +
    "</div>" +
    body +
    '<button class="btn-ghost" data-act="admin-logout">退出家长模式</button>'
  );
}

function adminReview() {
  const list = S.admin.pending;
  if (!list) return '<div class="loading">加载中…</div>';
  if (!list.length) return '<div class="empty">没有待审核的题目。</div>';
  return list.map((q) =>
    '<div class="review-item">' +
      '<div class="pt">' + esc(q.lesson) + " · " + esc(q.point) + " · " + TYPE_NAME[q.type] + "</div>" +
      '<div class="qs">' + prettyStem(q) + "</div>" +
      '<div class="ans">答案：' + esc(q.answerText) + "</div>" +
      '<div class="row">' +
        '<button class="mini" data-act="review" data-id="' + esc(q.id) + '" data-status="approved">通过</button>' +
        '<button class="mini danger" data-act="review" data-id="' + esc(q.id) + '" data-status="rejected">淘汰</button>' +
      "</div>" +
    "</div>"
  ).join("");
}

function adminKps() {
  const list = S.admin.kps;
  if (!list) return '<div class="loading">加载中…</div>';
  const groups = new Map();
  list.forEach((k) => {
    const key = "第" + k.lesson_no + "课 " + k.lesson;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(k);
  });
  let html = '<div class="hint" style="margin:0 0 12px">打开开关，冲刺模式会优先出这些知识点的题。</div>';
  groups.forEach((items, key) => {
    html += '<div class="kp-group"><h4>' + esc(key) + "</h4>";
    items.forEach((k) => {
      html += '<div class="kp-row">' +
        '<div class="t">' + esc(k.title) + '<div class="s">' + k.qcount + " 题 · " +
          (k.stage === 2 ? "已掌握" : k.stage === 1 ? "复习中" : "未开始") + "</div></div>" +
        '<button class="switch ' + (k.important ? "on" : "") + '" data-act="kp-important" data-id="' +
          esc(k.id) + '" data-on="' + (k.important ? "1" : "0") + '"></button>' +
      "</div>";
    });
    html += "</div>";
  });
  return html;
}

function adminReport() {
  const s = S.admin.summary;
  if (!s) return '<div class="loading">加载中…</div>';
  const st = s.stats;
  return (
    '<div class="summary-grid">' +
      '<div class="summary-cell"><b>' + st.todayDone + "</b><span>今日题数</span></div>" +
      '<div class="summary-cell"><b>' + st.weekDone + "</b><span>近 7 天题数</span></div>" +
      '<div class="summary-cell"><b>' + st.mastered + "/" + st.totalKp + "</b><span>已掌握知识点</span></div>" +
      '<div class="summary-cell"><b>' + st.wrongCount + "</b><span>错题待复习</span></div>" +
    "</div>" +
    '<div class="section-title">各课掌握情况</div>' +
    s.byLesson.map((l) =>
      '<div class="kp-row"><div class="t">第' + l.no + "课 " + esc(l.title) +
        '<div class="s">' + l.mastered + "/" + l.kpCount + " 个知识点已掌握</div></div></div>"
    ).join("") +
    '<div class="section-title">最常错的题</div>' +
    (s.topWrong.length
      ? s.topWrong.map((w) =>
          '<div class="review-item"><div class="pt">' + esc(w.point) + " · 错 " + w.times + " 次</div>" +
            '<div class="qs">' + esc(w.stem) + "</div></div>"
        ).join("")
      : '<div class="empty">还没有错题记录。</div>') +
    '<div class="section-title">修改家长密码</div>' +
    '<div class="form-row">' +
      '<input class="pin-input" id="newPin" inputmode="numeric" maxlength="4" placeholder="新密码">' +
      '<button class="fill-submit" data-act="pin-change">保存</button>' +
    "</div>"
  );
}

function adminData() {
  const st = S.boot ? S.boot.stats : { totalQuestions: 0, totalKp: 0 };
  const meta = S.boot ? S.boot.meta : {};
  return (
    '<div class="summary-grid">' +
      '<div class="summary-cell"><b>' + st.totalQuestions + "</b><span>题库题数</span></div>" +
      '<div class="summary-cell"><b>' + st.totalKp + "</b><span>知识点</span></div>" +
    "</div>" +
    '<div class="card" style="padding:16px;margin-top:14px">' +
      '<div class="hint" style="margin:0 0 6px;font-size:13px">当前题库</div>' +
      '<div style="font-size:15px;line-height:1.8">' +
        esc(meta.subject || "未命名") + " · " + esc(meta.grade || "") + esc(meta.volume || "") +
        '<div class="s" style="color:#9aa1ad;font-size:12px">' + esc(meta.source || "") + "</div>" +
      "</div>" +
    "</div>" +
    '<div class="section-title">导入新题库</div>' +
    '<div class="card" style="padding:16px">' +
      '<div class="hint" style="margin:0 0 12px;line-height:1.7">' +
        "支持两种 JSON：<br>① 结构化提纲（含 lessons）—— 自动生成题目<br>② 已生成的题库（含 questions）—— 直接导入" +
      "</div>" +
      '<input type="file" id="importFile" accept=".json,application/json" hidden>' +
      '<button class="primary" data-act="pick-import">选择题库文件</button>' +
    "</div>" +
    '<div class="section-title">备份与重置</div>' +
    '<button class="secondary" data-act="export-backup">导出备份（含题库和记录）</button>' +
    '<button class="secondary" data-act="reset-progress">清空练习记录</button>' +
    '<div class="hint" style="margin-top:14px">数据全部存在这台平板上，建议每周导出一次备份。</div>'
  );
}

// ---------- 动作 ----------
async function loadBootstrap() {
  try {
    S.boot = await api("/api/bootstrap");
  } catch (e) {
    toast(e.message);
  }
  render();
}

async function start(mode, lessonId) {
  try {
    const res = await api("/api/session", {
      method: "POST",
      body: JSON.stringify({ mode, lessonId: lessonId || null, count: mode === "rush" ? 20 : 10 }),
    });
    if (!res.questions.length) { toast("没有可用的题目"); return; }
    S.session = { qs: res.questions, idx: 0, answers: [], startedAt: Date.now(), mode };
    S.answered = false; S.submitting = false; S.last = null;
    S.view = "quiz";
    render();
    window.scrollTo(0, 0);
  } catch (e) {
    toast(e.message);
  }
}

async function startRecite(lessonId) {
  try {
    const res = await api("/api/recite/session", { method: "POST", body: JSON.stringify({ lessonId }) });
    if (!res.questions.length) { toast("这一课没有可背的内容"); return; }
    S.session = { qs: res.questions, idx: 0, answers: [], startedAt: Date.now(), mode: "recite", lessonId };
    S.answered = false; S.submitting = false; S.last = null;
    S.view = "quiz";
    render();
    window.scrollTo(0, 0);
  } catch (e) {
    toast(e.message);
  }
}

async function submit(q, value) {
  if (S.answered || S.submitting) return;
  S.submitting = true;
  render();
  try {
    const r = S.session.mode === "recite"
      ? await api("/api/recite/answer", { method: "POST", body: JSON.stringify({ itemId: q.itemId, start: q.start, end: q.end, answer: value }) })
      : await api("/api/answer", { method: "POST", body: JSON.stringify({ qid: q.id, answer: value }) });

    S.last = Object.assign({}, r, { userAnswer: value });
    S.answered = true;
    S.session.answers.push({
      qid: q.id, correct: r.correct, answerText: r.answerText,
      stem: q.stem, lesson: q.lesson, point: q.point,
    });
  } catch (e) {
    toast(e.message);
  } finally {
    S.submitting = false;
    render();
  }
}

function next() {
  S.session.idx += 1;
  S.answered = false;
  S.last = null;
  if (S.session.idx >= S.session.qs.length) {
    S.view = "result";
    loadBootstrap();
  }
  render();
  window.scrollTo(0, 0);
}

async function openWrong() {
  S.view = "wrong";
  S.wrongList = null;
  render();
  try {
    S.wrongList = (await api("/api/wrong")).list;
  } catch (e) {
    toast(e.message);
    S.wrongList = [];
  }
  render();
}

async function adminLogin() {
  if (!/^\d{4}$/.test(S.pin)) { toast("请输入 4 位数字"); return; }
  try {
    const r = await api("/api/admin/login", { method: "POST", body: JSON.stringify({ pin: S.pin }) });
    S.adminToken = r.token;
    localStorage.setItem("fx_admin", r.token);
    S.pin = "";
    S.view = "admin";
    S.admin.tab = "review";
    loadAdmin("review");
  } catch (e) {
    toast(e.message);
  }
}

async function loadAdmin(tab) {
  S.admin.tab = tab;
  S.admin.loading = true;
  render();
  try {
    if (tab === "review") S.admin.pending = (await api("/api/admin/pending")).list;
    else if (tab === "kps") S.admin.kps = (await api("/api/admin/kps")).list;
    else if (tab === "report") S.admin.summary = await api("/api/admin/summary");
  } catch (e) {
    toast(e.message);
  } finally {
    S.admin.loading = false;
    render();
  }
}

async function importFile(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const r = await api("/api/admin/import", { method: "POST", body: JSON.stringify({ data }) });
    toast("已导入 " + r.count + " 道题");
    S.admin.pending = null;
    await loadBootstrap();
    render();
  } catch (e) {
    toast("导入失败：" + e.message);
  }
}

async function exportBackup() {
  try {
    const data = await api("/api/admin/export");
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "fuke-backup-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    toast("已导出");
  } catch (e) {
    toast(e.message);
  }
}

// ---------- 事件 ----------
app.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const act = el.getAttribute("data-act");

  if (act === "daily") return start("daily");
  if (act === "rush") { S.view = "rush"; render(); return; }
  if (act === "rush-start") {
    const sel = document.getElementById("rushLesson");
    return start("rush", sel ? sel.value : "");
  }
  if (act === "recite") { S.view = "recite"; render(); return; }
  if (act === "recite-start") return startRecite(el.getAttribute("data-id"));
  if (act === "wrong") return openWrong();
  if (act === "wrong-retry") return start("rush");
  if (act === "lesson") return start("daily", el.getAttribute("data-id"));
  if (act === "home") { S.view = "home"; S.wrongList = null; render(); return; }
  if (act === "quit") {
    if (S.session && S.session.answers.length && !confirm("本组还没做完，确定退出吗？")) return;
    S.session = null; S.answered = false; S.last = null; S.view = "home"; render(); return;
  }
  if (act === "again") {
    if (S.session && S.session.mode === "recite") return startRecite(S.session.lessonId);
    return start("daily");
  }
  if (act === "next") return next();
  if (act === "opt") return submit(S.session.qs[S.session.idx], Number(el.getAttribute("data-i")));
  if (act === "judge") return submit(S.session.qs[S.session.idx], el.getAttribute("data-v") === "1");
  if (act === "fill-submit") {
    const input = document.getElementById("fillInput");
    const v = input ? input.value.trim() : "";
    if (!v) { if (input) input.focus(); return; }
    return submit(S.session.qs[S.session.idx], v);
  }
  if (act === "admin") { S.view = "admin"; render(); return; }
  if (act === "pin-login") return adminLogin();
  if (act === "admin-tab") return loadAdmin(el.getAttribute("data-tab"));
  if (act === "admin-logout") {
    S.adminToken = ""; localStorage.removeItem("fx_admin");
    S.admin = { tab: "review", pending: null, kps: null, summary: null, loading: false };
    S.view = "home"; render(); return;
  }
  if (act === "review") {
    try {
      const r = await api("/api/admin/question", { method: "POST", body: JSON.stringify({ id: el.getAttribute("data-id"), status: el.getAttribute("data-status") }) });
      S.admin.pending = S.admin.pending.filter((x) => x.id !== el.getAttribute("data-id"));
      toast("已处理，剩余 " + r.pending + " 道待审");
      render();
    } catch (err) { toast(err.message); }
    return;
  }
  if (act === "kp-important") {
    const kpId = el.getAttribute("data-id");
    const on = el.getAttribute("data-on") === "1";
    try {
      await api("/api/admin/kp", { method: "POST", body: JSON.stringify({ id: kpId, important: !on }) });
      const item = (S.admin.kps || []).find((k) => k.id === kpId);
      if (item) item.important = on ? 0 : 1;
      render();
    } catch (err) { toast(err.message); }
    return;
  }
  if (act === "pin-change") {
    const elPin = document.getElementById("newPin");
    const pin = elPin ? elPin.value.trim() : "";
    if (!/^\d{4}$/.test(pin)) { toast("新密码要 4 位数字"); return; }
    try {
      await api("/api/admin/pin", { method: "POST", body: JSON.stringify({ pin }) });
      toast("密码已修改");
      if (elPin) elPin.value = "";
    } catch (err) { toast(err.message); }
    return;
  }
  if (act === "pick-import") {
    const input = document.getElementById("importFile");
    if (input) input.click();
    return;
  }
  if (act === "export-backup") return exportBackup();
  if (act === "reset-progress") {
    if (!confirm("清空所有练习记录、错题和重点标记？题库会保留。")) return;
    try {
      await api("/api/admin/reset", { method: "POST", body: "{}" });
      toast("已清空练习记录");
      S.admin.summary = null; S.admin.kps = null;
      await loadBootstrap();
      render();
    } catch (err) { toast(err.message); }
    return;
  }
});

app.addEventListener("change", (e) => {
  if (e.target.id === "importFile" && e.target.files && e.target.files[0]) {
    importFile(e.target.files[0]);
    e.target.value = "";
  }
});

app.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  if (e.target.id === "pinInput") {
    e.preventDefault();
    adminLogin();
  } else if (e.target.id === "fillInput") {
    e.preventDefault();
    const v = e.target.value.trim();
    if (v) submit(S.session.qs[S.session.idx], v);
  }
});

app.addEventListener("input", (e) => {
  if (e.target.id === "pinInput") S.pin = e.target.value.replace(/\D/g, "").slice(0, 4);
});

// ---------- 启动 ----------
(async function boot() {
  try {
    await store.init();
  } catch (e) {
    toast("初始化失败：" + e.message);
  }
  await loadBootstrap();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
})();
