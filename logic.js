// 出题与判分：从 generate.mjs 移植，全部在浏览器里跑

function shuffle(a) {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function norm(s) {
  return String(s).replace(/\s/g, "").replace(/[，。；、,.!?！？"“”‘’]/g, "");
}

export function judge(q, ans) {
  if (q.type === "choice") return Number(ans) === Number(q.answer);
  if (q.type === "judge") {
    const isTrue = ans === true || ans === "true" || ans === "1" || ans === 1;
    const isFalse = ans === false || ans === "false" || ans === "0" || ans === 0;
    if (!isTrue && !isFalse) return false;
    return isTrue === (q.answer === "1");
  }
  const u = norm(ans), a = norm(q.answer);
  return !!u && !!a && (u === a || (u.length >= 2 && u.includes(a)) || (a.length >= 2 && a.includes(u)));
}

export function judgeText(user, correct) {
  const u = norm(user), a = norm(correct);
  return !!u && !!a && (u === a || (u.length >= 2 && u.includes(a)) || (a.length >= 2 && a.includes(u)));
}

export function answerText(q) {
  if (q.type === "choice") {
    const opts = Array.isArray(q.options) ? q.options : JSON.parse(q.options || "[]");
    return opts[Number(q.answer)];
  }
  if (q.type === "judge") return q.answer === "1" ? "正确" : "错误";
  return q.answer;
}

// ---------- 判断题的错误改法 ----------
const JUDGE_SWAPS = [
  ["有助于", "不利于"], ["有利于", "不利于"], ["需要", "不需要"], ["应当", "不必"],
  ["应该", "不必"], ["必须", "可以不"], ["可以", "不能"], ["增强", "削弱"],
  ["提高", "降低"], ["促进", "阻碍"], ["积极", "消极"], ["主动", "被动"],
  ["自觉", "被迫"], ["永恒", "短暂"], ["第一所", "第二所"], ["真诚", "虚伪"],
  ["相互", "单方面"], ["共同", "个人"], ["正确", "错误"], ["优良", "不良"],
  ["提供", "剥夺"], ["提出", "取消"], ["形成", "放弃"], ["具有", "缺乏"],
  ["帮助", "阻碍"], ["获得", "失去"], ["树立", "放弃"], ["确立", "放弃"],
  ["确定", "取消"], ["制订", "放弃"], ["培养", "埋没"], ["珍惜", "漠视"],
  ["珍视", "漠视"], ["把握", "错过"], ["坚持", "放弃"], ["接受", "拒绝"],
  ["尊重", "轻视"], ["理解", "误解"], ["关心", "漠视"], ["支持", "反对"],
  ["鼓励", "打击"], ["表扬", "批评"], ["批评", "表扬"],
];
const SAFE_BEFORE_SHI = "但可总还就只或凡若要算";

function pickSwap(text) {
  for (const [from, to] of shuffle(JUDGE_SWAPS)) {
    const i = text.indexOf(from);
    if (i >= 0) return { from, to, index: i };
  }
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "是") continue;
    const prev = i > 0 ? text[i - 1] : "";
    if (prev === "" || !SAFE_BEFORE_SHI.includes(prev)) {
      return { from: "是", to: "不是", index: i };
    }
  }
  return null;
}

function tooShort(text, key) {
  const rest = text.replace(key, "").replace(/[；。，、！？：\s]/g, "");
  return rest.length < 6;
}

// 输入 { meta, lessons }，输出题目数组
export function generateQuestions(struct) {
  const items = [];
  for (const lesson of struct.lessons) {
    for (const point of lesson.points) {
      for (const item of point.items) {
        items.push({ lesson, point, item });
      }
    }
  }
  const allKeys = [...new Set(items.flatMap((x) => x.item.keys || []))];

  const questions = [];
  let seq = 0;
  const nextId = () => `Q-${String(++seq).padStart(4, "0")}`;

  // 1. 填空
  for (const { lesson, point, item } of items) {
    for (const key of item.keys || []) {
      if (!item.text.includes(key)) continue;
      if (tooShort(item.text, key)) continue;
      questions.push({
        id: nextId(),
        type: "fill",
        status: "approved",
        kpId: point.id,
        lessonId: lesson.id,
        lesson: `第${lesson.no}课 ${lesson.title}`,
        point: point.title,
        stem: item.text.replace(key, "＿＿＿＿"),
        answer: key,
        source: item.text,
        explain: `原文：${item.text}`,
      });
    }
  }

  // 2. 单选
  for (const { lesson, point, item } of items) {
    for (const key of item.keys || []) {
      if (!item.text.includes(key)) continue;
      if (tooShort(item.text, key)) continue;
      const stem = item.text.replace(key, "（　　）");

      const buckets = [
        point.items.filter((it) => it.id !== item.id).flatMap((it) => it.keys || []),
        lesson.points.filter((p) => p.id !== point.id).flatMap((p) => p.items.flatMap((it) => it.keys || [])),
        allKeys,
      ];

      const distractors = [];
      for (const bucket of buckets) {
        if (distractors.length >= 3) break;
        const cands = shuffle([...new Set(bucket)]).filter(
          (c) =>
            c !== key &&
            !c.includes(key) &&
            !key.includes(c) &&
            !stem.includes(c) &&
            !distractors.includes(c) &&
            Math.abs(c.length - key.length) <= 6
        );
        for (const c of cands) {
          if (distractors.length >= 3) break;
          distractors.push(c);
        }
      }
      if (distractors.length < 3) continue;

      const options = shuffle([key, ...distractors]);
      questions.push({
        id: nextId(),
        type: "choice",
        status: "approved",
        kpId: point.id,
        lessonId: lesson.id,
        lesson: `第${lesson.no}课 ${lesson.title}`,
        point: point.title,
        stem,
        options,
        answerIndex: options.indexOf(key),
        answer: String(options.indexOf(key)),
        source: item.text,
        explain: `原文：${item.text}`,
      });
    }
  }

  // 3. 判断
  for (const { lesson, point, item } of items) {
    let stem = item.text;
    let answer = true;
    let explain = `原文：${item.text}`;

    if (Math.random() < 0.5) {
      const swap = pickSwap(item.text);
      if (swap) {
        stem =
          item.text.slice(0, swap.index) +
          swap.to +
          item.text.slice(swap.index + swap.from.length);
        answer = false;
        explain = `原文：${item.text}　本题把“${swap.from}”改成了“${swap.to}”。`;
      }
    }

    questions.push({
      id: nextId(),
      type: "judge",
      status: "approved",
      kpId: point.id,
      lessonId: lesson.id,
      lesson: `第${lesson.no}课 ${lesson.title}`,
      point: point.title,
      stem,
      answer: answer ? "1" : "0",
      source: item.text,
      explain,
    });
  }

  return questions;
}
