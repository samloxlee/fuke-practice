// 背书模式的挖空逻辑：用浏览器内置 Intl.Segmenter 做中文分词，
// 每条知识点随机挑一个词挖空，所以同一条知识每次练的空位都不一样。

const SEG = new Intl.Segmenter("zh-CN", { granularity: "word" });

const STOP = new Set([
  "的", "了", "是", "在", "和", "与", "及", "或", "而", "就", "都", "也", "很", "更", "最",
  "这", "那", "其", "之", "为", "以", "于", "对", "从", "把", "被", "让", "给", "着", "过",
  "地", "得", "所", "等", "并", "但", "却", "还",
  "我们", "你们", "他们", "自己", "这个", "那个", "什么", "怎么", "可以", "应该", "需要",
  "能够", "因为", "所以", "但是", "如果", "虽然", "然后", "以及", "就是", "还是", "或者",
  "一个", "一种", "一些", "这样", "那样", "时候", "方面", "之间", "其中", "对于", "关于",
  "通过", "进行", "具有", "没有", "不是", "不会", "不能",
  "新的", "更高", "更大", "更好", "更多", "更强", "不同", "各种", "许多", "一定",
  "更加", "特别", "非常", "十分", "比较", "初步", "不断", "逐步", "逐渐",
]);

const SUFFIX = new Set("观者性化力感心期度法论品人".split(""));
const PREFIX = new Set("敢肯能会有可应必".split(""));

function wordsOf(text) {
  const segs = [...SEG.segment(text)]
    .filter((s) => s.isWordLike)
    .map((s) => ({ word: s.segment, start: s.index }));

  const merged = [];
  for (const s of segs) {
    const prev = merged[merged.length - 1];
    if (s.word.length === 1 && prev && SUFFIX.has(s.word) && prev.start + prev.word.length === s.start) {
      prev.word += s.word;
      continue;
    }
    merged.push({ ...s });
  }

  const out = [];
  for (let i = 0; i < merged.length; i++) {
    const s = merged[i];
    const next = merged[i + 1];
    if (s.word.length === 1 && PREFIX.has(s.word) && next && s.start + 1 === next.start) {
      out.push({ word: s.word + next.word, start: s.start });
      i++;
      continue;
    }
    out.push(s);
  }
  return out;
}

export function candidatesOf(text, keys = []) {
  const out = [];
  const seen = new Set();
  const add = (start, end, word) => {
    const k = start + ":" + end;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ start, end, word });
  };

  for (const key of keys) {
    if (!key || key.length < 2 || key.length > 10) continue;
    const idx = text.indexOf(key);
    if (idx >= 0) add(idx, idx + key.length, key);
  }

  for (const w of wordsOf(text)) {
    if (w.word.length < 2 || w.word.length > 8) continue;
    if (STOP.has(w.word)) continue;
    add(w.start, w.start + w.word.length, w.word);
  }

  return out;
}

export function pickCandidate(text, keys = []) {
  const all = candidatesOf(text, keys);
  if (!all.length) return null;

  const usable = all.filter((c) => {
    const rest = text.slice(0, c.start) + text.slice(c.end);
    return rest.replace(/[；。，、！？：\s“”‘’]/g, "").length >= 4;
  });
  if (!usable.length) return null;

  const keyCands = usable.filter((c) => keys.includes(c.word));
  const pool = keyCands.length && Math.random() < 0.5 ? keyCands : usable;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function checkSpan(text, keys, start, end) {
  return candidatesOf(text, keys).some((c) => c.start === start && c.end === end);
}
