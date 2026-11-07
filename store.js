// 本地数据层：所有读写都走 IndexedDB，不依赖任何服务器
import * as idb from "./idb.js";
import { judge, answerText, generateQuestions } from "./logic.js";
import { pickCandidate, checkSpan } from "./recite.js";

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const addDays = (dateStr, n) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
};

async function getSetting(key, fallback) {
  const row = await idb.get("settings", key);
  return row ? row.value : fallback;
}
async function setSetting(key, value) {
  await idb.put("settings", { id: key, value: String(value) });
}

// ---------- 初始化 / 导入 ----------
export async function init() {
  const count = (await idb.getAll("questions")).length;
  if (count > 0) return { seeded: false };
  try {
    const res = await fetch("./seed.json", { cache: "no-cache" });
    if (!res.ok) return { seeded: false };
    const seed = await res.json();
    await importData(seed, { replace: true });
    return { seeded: true };
  } catch (e) {
    return { seeded: false, error: e.message };
  }
}

export async function importData(data, { replace = true } = {}) {
  const struct = data.lessons ? data : null;
  let questions = data.questions;
  if (!questions && struct) questions = generateQuestions(struct);
  if (!questions || !questions.length) throw new Error("文件里没有可识别的题目");

  questions = questions.map((q) => {
    const qq = { ...q };
    qq.id = qq.id || `Q-${Math.random().toString(36).slice(2, 9)}`;
    qq.kpId = qq.kpId || "";
    qq.lessonId = qq.lessonId || (qq.kpId ? qq.kpId.split("-")[0] : "");
    qq.status = qq.status || "approved";
    return qq;
  });

  if (replace) {
    for (const s of ["meta", "lessons", "kps", "items", "questions"]) await idb.clear(s);
  }

  const meta = data.meta || {};
  for (const [k, v] of Object.entries(meta)) {
    await idb.put("meta", { id: k, value: String(v) });
  }

  if (struct) {
    for (const l of struct.lessons) {
      await idb.put("lessons", { id: l.id, no: l.no, title: l.title });
      for (const p of l.points) {
        await idb.put("kps", { id: p.id, lessonId: l.id, title: p.title, important: 0 });
        for (const it of p.items) {
          await idb.put("items", { id: it.id, kpId: p.id, text: it.text, keys: it.keys || [] });
        }
      }
    }
  } else {
    const seen = new Map();
    for (const q of questions) {
      if (!seen.has(q.lessonId) && q.lesson) {
        const m = q.lesson.match(/第(\d+)课\s*(.*)/);
        seen.set(q.lessonId, {
          id: q.lessonId,
          no: m ? Number(m[1]) : 0,
          title: m ? m[2] : q.lesson,
        });
      }
    }
    for (const l of seen.values()) await idb.put("lessons", l);
  }

  await idb.putAll("questions", questions);
  return { count: questions.length };
}

// ---------- 查询 ----------
export async function bootstrap() {
  const [metaRows, lessons, questions, kps, items] = await Promise.all([
    idb.getAll("meta"), idb.getAll("lessons"), idb.getAll("questions"),
    idb.getAll("kps"), idb.getAll("items"),
  ]);
  const meta = Object.fromEntries(metaRows.map((r) => [r.id, r.value]));

  const counts = {};
  for (const q of questions) {
    if (q.status === "rejected") continue;
    counts[q.lessonId] = (counts[q.lessonId] || 0) + 1;
  }
  const kpLesson = Object.fromEntries(kps.map((k) => [k.id, k.lessonId]));
  const itemCount = {};
  for (const it of items) {
    const lid = kpLesson[it.kpId];
    if (lid) itemCount[lid] = (itemCount[lid] || 0) + 1;
  }

  const lessonList = lessons
    .sort((a, b) => a.no - b.no)
    .map((l) => ({ ...l, count: counts[l.id] || 0, items: itemCount[l.id] || 0 }));

  return {
    meta,
    lessons: lessonList,
    stats: await stats(),
    pending: questions.filter((q) => q.status === "pending").length,
  };
}

export async function stats() {
  const [attempts, wrong, kps, reviews, questions] = await Promise.all([
    idb.getAll("attempts"), idb.getAll("wrong"), idb.getAll("kps"),
    idb.getAll("reviews"), idb.getAll("questions"),
  ]);
  const day = todayStr();
  const today = attempts.filter((a) => a.day === day);
  const week = attempts.filter((a) => a.day >= addDays(day, -6));
  return {
    todayDone: today.length,
    todayCorrect: today.filter((a) => a.correct).length,
    wrongCount: wrong.length,
    totalKp: kps.length,
    mastered: reviews.filter((r) => r.stage === 2).length,
    totalQuestions: questions.filter((q) => q.status !== "rejected").length,
    weekDone: week.length,
    weekCorrect: week.filter((a) => a.correct).length,
  };
}

export async function createSession({ mode = "daily", lessonId = null, count = 10 } = {}) {
  const [questions, wrong, kps, reviews] = await Promise.all([
    idb.getAll("questions"), idb.getAll("wrong"), idb.getAll("kps"), idb.getAll("reviews"),
  ]);
  const wrongSet = new Set(wrong.map((w) => w.id));
  const important = new Set(kps.filter((k) => k.important).map((k) => k.id));
  const due = new Set(reviews.filter((r) => r.dueAt && r.dueAt <= todayStr()).map((r) => r.id));

  let rows = questions.filter((q) => q.status !== "rejected");
  if (lessonId) rows = rows.filter((q) => q.lessonId === lessonId);

  const scored = rows
    .map((q) => {
      let s = Math.random() * 8;
      if (wrongSet.has(q.id)) s += 100;
      if (important.has(q.kpId)) s += 45;
      if (due.has(q.kpId)) s += 20;
      return { q, s };
    })
    .sort((a, b) => b.s - a.s);

  const picked = [];
  const perKp = new Map();
  for (const { q } of scored) {
    if (picked.length >= count) break;
    const n = perKp.get(q.kpId) || 0;
    if (n >= 2) continue;
    perKp.set(q.kpId, n + 1);
    picked.push(q);
  }
  if (picked.length < count) {
    for (const { q } of scored) {
      if (picked.length >= count) break;
      if (!picked.includes(q)) picked.push(q);
    }
  }

  return picked.map((q) => ({
    id: q.id,
    type: q.type,
    stem: q.stem,
    options: q.options || null,
    lesson: q.lesson,
    point: q.point,
    kpId: q.kpId,
    important: important.has(q.kpId),
  }));
}

async function updateReview(kpId, correct) {
  const r = (await idb.get("reviews", kpId)) || { id: kpId, stage: 0, streak: 0, lapses: 0 };
  let stage = r.stage, streak = r.streak, lapses = r.lapses;
  let due;
  if (correct) {
    streak += 1;
    stage = Math.min(2, stage + 1);
    due = addDays(todayStr(), stage === 2 ? 7 : stage === 1 ? 3 : 1);
  } else {
    streak = 0;
    stage = 0;
    lapses += 1;
    due = addDays(todayStr(), 1);
  }
  await idb.put("reviews", { id: kpId, stage, streak, lapses, dueAt: due, updatedAt: new Date().toISOString() });
}

export async function submitAnswer(qid, answer) {
  const q = await idb.get("questions", qid);
  if (!q) throw new Error("题目不存在");
  const correct = judge(q, answer);

  await idb.put("attempts", {
    id: `a_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    qid, kpId: q.kpId, correct: !!correct, userAnswer: answer,
    at: new Date().toISOString(), day: todayStr(),
  });

  if (correct) await idb.del("wrong", qid);
  else await idb.put("wrong", { id: qid, since: todayStr() });

  await updateReview(q.kpId, correct);

  return {
    correct,
    answerText: answerText(q),
    answerIndex: q.type === "choice" ? Number(q.answer) : null,
    explain: q.explain,
    source: q.source,
    lesson: q.lesson,
    point: q.point,
  };
}

export async function getWrong() {
  const [wrong, questions] = await Promise.all([idb.getAll("wrong"), idb.getAll("questions")]);
  const map = new Map(questions.map((q) => [q.id, q]));
  return wrong
    .map((w) => map.get(w.id))
    .filter(Boolean)
    .map((q) => ({
      id: q.id, type: q.type, stem: q.stem,
      lesson: q.lesson, point: q.point, answerText: answerText(q),
    }));
}

// ---------- 背书模式 ----------
export async function reciteSession(lessonId) {
  const [items, kps, lessons] = await Promise.all([
    idb.getAll("items"), idb.getAll("kps"), idb.getAll("lessons"),
  ]);
  const kpMap = new Map(kps.map((k) => [k.id, k]));
  const lessonMap = new Map(lessons.map((l) => [l.id, l]));

  const rows = items
    .filter((it) => it.kpId.startsWith(lessonId + "-"))
    .sort((a, b) => a.id.localeCompare(b.id));

  const out = [];
  for (const it of rows) {
    const c = pickCandidate(it.text, it.keys || []);
    if (!c) continue;
    const kp = kpMap.get(it.kpId);
    const lesson = kp ? lessonMap.get(kp.lessonId) : null;
    out.push({
      id: `recite:${it.id}:${c.start}:${c.end}`,
      type: "fill",
      stem: it.text.slice(0, c.start) + "＿＿＿＿" + it.text.slice(c.end),
      lesson: lesson ? `第${lesson.no}课 ${lesson.title}` : "",
      point: kp ? kp.title : "",
      kpId: it.kpId,
      itemId: it.id,
      start: c.start,
      end: c.end,
    });
  }
  return out;
}

export async function reciteAnswer({ itemId, start, end, answer }) {
  const it = await idb.get("items", itemId);
  if (!it) throw new Error("题目不存在");

  const s = Number(start), e = Number(end);
  if (!Number.isInteger(s) || !Number.isInteger(e) || !checkSpan(it.text, it.keys || [], s, e)) {
    throw new Error("这道题已过期，请重新进入背书模式");
  }

  const answerText = it.text.slice(s, e);
  const u = String(answer).replace(/\s/g, "").replace(/[，。；、,.!?！？"“”‘’]/g, "");
  const a = answerText.replace(/\s/g, "").replace(/[，。；、,.!?！？"“”‘’]/g, "");
  const correct = !!u && !!a && (u === a || (u.length >= 2 && u.includes(a)) || (a.length >= 2 && a.includes(u)));

  const kp = await idb.get("kps", it.kpId);
  await idb.put("attempts", {
    id: `a_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    qid: `recite:${itemId}`, kpId: it.kpId, correct: !!correct, userAnswer: answer,
    at: new Date().toISOString(), day: todayStr(),
  });
  await updateReview(it.kpId, correct);

  const lesson = kp ? await idb.get("lessons", kp.lessonId) : null;
  return {
    correct,
    answerText,
    explain: `原文：${it.text}`,
    lesson: lesson ? `第${lesson.no}课 ${lesson.title}` : "",
    point: kp ? kp.title : "",
  };
}

// ---------- 家长模式 ----------
export async function getPin() {
  return getSetting("admin_pin", "1234");
}
export async function login(pin) {
  if (String(pin) !== (await getPin())) throw new Error("密码不对");
  return { token: "local" };
}
export async function setPin(pin) {
  if (!/^\d{4}$/.test(String(pin))) throw new Error("密码要 4 位数字");
  await setSetting("admin_pin", pin);
  return { ok: true };
}

export async function listKps() {
  const [kps, reviews, lessons, questions] = await Promise.all([
    idb.getAll("kps"), idb.getAll("reviews"), idb.getAll("lessons"), idb.getAll("questions"),
  ]);
  const reviewMap = new Map(reviews.map((r) => [r.id, r]));
  const lessonMap = new Map(lessons.map((l) => [l.id, l]));
  const qcount = {};
  for (const q of questions) if (q.status !== "rejected") qcount[q.kpId] = (qcount[q.kpId] || 0) + 1;

  return kps
    .map((k) => {
      const l = lessonMap.get(k.lessonId) || {};
      const r = reviewMap.get(k.id) || {};
      return {
        id: k.id, title: k.title, important: k.important ? 1 : 0,
        lesson_no: l.no || 0, lesson: l.title || "",
        stage: r.stage || 0, streak: r.streak || 0, qcount: qcount[k.id] || 0,
      };
    })
    .sort((a, b) => a.lesson_no - b.lesson_no || a.id.localeCompare(b.id));
}

export async function setImportant(kpId, important) {
  const k = await idb.get("kps", kpId);
  if (k) await idb.put("kps", { ...k, important: important ? 1 : 0 });
  return { ok: true };
}

export async function listPending() {
  const questions = await idb.getAll("questions");
  return questions
    .filter((q) => q.status === "pending")
    .map((q) => ({ ...q, answerText: answerText(q) }));
}

export async function setStatus(id, status) {
  const q = await idb.get("questions", id);
  if (q) await idb.put("questions", { ...q, status });
  const pending = (await idb.getAll("questions")).filter((x) => x.status === "pending").length;
  return { ok: true, pending };
}

export async function summary() {
  const [attempts, questions, kps, lessons, reviews] = await Promise.all([
    idb.getAll("attempts"), idb.getAll("questions"), idb.getAll("kps"),
    idb.getAll("lessons"), idb.getAll("reviews"),
  ]);
  const reviewMap = new Map(reviews.map((r) => [r.id, r]));
  const qMap = new Map(questions.map((q) => [q.id, q]));

  const byLesson = lessons
    .sort((a, b) => a.no - b.no)
    .map((l) => {
      const ks = kps.filter((k) => k.lessonId === l.id);
      return {
        id: l.id, no: l.no, title: l.title,
        kpCount: ks.length,
        mastered: ks.filter((k) => (reviewMap.get(k.id) || {}).stage === 2).length,
      };
    });

  const wrongCount = {};
  for (const a of attempts) {
    if (a.correct) continue;
    if (a.qid.startsWith("recite:")) continue;
    wrongCount[a.qid] = (wrongCount[a.qid] || 0) + 1;
  }
  const topWrong = Object.entries(wrongCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([qid, times]) => {
      const q = qMap.get(qid);
      return q ? { id: qid, stem: q.stem, point: q.point, times } : null;
    })
    .filter(Boolean);

  const dayMap = {};
  for (const a of attempts) {
    if (!dayMap[a.day]) dayMap[a.day] = { day: a.day, done: 0, correct: 0 };
    dayMap[a.day].done++;
    if (a.correct) dayMap[a.day].correct++;
  }
  const days = Object.values(dayMap).sort((a, b) => (a.day < b.day ? 1 : -1)).slice(0, 7);

  return { stats: await stats(), byLesson, topWrong, days };
}

// ---------- 备份 ----------
export async function exportData() {
  const [metaRows, lessons, kps, items, questions] = await Promise.all([
    idb.getAll("meta"), idb.getAll("lessons"), idb.getAll("kps"),
    idb.getAll("items"), idb.getAll("questions"),
  ]);
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    meta: Object.fromEntries(metaRows.map((r) => [r.id, r.value])),
    lessons,
    kps,
    items,
    questions,
  };
}

export async function reset() {
  for (const s of ["attempts", "wrong", "reviews"]) await idb.clear(s);
  const kps = await idb.getAll("kps");
  for (const k of kps) await idb.put("kps", { ...k, important: 0 });
  return { ok: true };
}

export async function clearAllData() {
  await idb.clearAll();
  return { ok: true };
}

// 统一出口，app.js 里按对象调用
export const store = {
  init, importData, bootstrap, stats, createSession, submitAnswer, getWrong,
  reciteSession, reciteAnswer, getPin, login, setPin, listKps, setImportant,
  listPending, setStatus, summary, exportData, reset, clearAllData,
};
