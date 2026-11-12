// 8-bit 老學究老師（上半身）與像素頭像
// 以字元網格描述像素，canvas 放大繪製；支援表情 mood 與眨眼。

export const PALETTE = {
  ".": null,
  k: "#1b1b1f", // 墨線
  s: "#f1c9a5", // 膚色
  S: "#d9a67c", // 膚色陰影
  w: "#f7f3e8", // 鬍子/白髮
  g: "#cfc8bb", // 鬍子陰影
  b: "#2b3f6b", // 長衫
  B: "#1d2b4a", // 瓜皮帽
  r: "#c8322b", // 紅（帽頂/衣領）
  G: "#c9a227", // 金框眼鏡
  L: "#e3f4ff", // 鏡片
  e: "#1b1b1f", // 眼珠
  p: "#e8a3a3", // 腮紅
  m: "#7a3b3b", // 口腔
  t: "#f7f3e8", // 牙
};

// 基礎圖（24 x 30）
const BASE = [
  "..........rr............",
  ".......kkkkkkkkk........",
  ".....kkBBBBBBBBBkk......",
  "....kBBBBBBBBBBBBBk.....",
  "....kBBBBBBBBBBBBBk.....",
  "...kBBBBBBBBBBBBBBBk....",
  "...ksssssssssssssssk....",
  "..kssssssssssssssssssk..",
  "..kssGGGGGsssGGGGGsssk..",
  "..ksGLLLLLGsGLLLLLGssk..",
  "..ksGLLeLLGGGLLeLLGssk..",
  "..ksGLLLLLGsGLLLLLGssk..",
  "..kssGGGGGsssGGGGGsssk..",
  "..kspsssssSSSsssssspsk..",
  "..kssssssssSssssssssk...",
  "...kwwwwwwwwwwwwwwwwk...",
  "...kwwwwwkkkkkkwwwwwk...",
  "...kwwwwwwwwwwwwwwwwk...",
  "....kwwwwwwwwwwwwwwk....",
  ".....kwwwwwwwwwwwwk.....",
  "......kwwwggwwwwwk......",
  ".......kwwwwwwwwk.......",
  "........kwwwwwwk........",
  "....kkkkkkrrrrrrkkkkk...",
  "...kbbbbbbrbbbbrbbbbbk..",
  "..kbbbbbbbrbbbbrbbbbbbk.",
  ".kbbbbbbbbrbbbbrbbbbbbbk",
  ".kbbbbbbbbrbbbbrbbbbbbbk",
  ".kbbbbbbbbrbbbbrbbbbbbbk",
  ".kbbbbbbbbrbbbbrbbbbbbbk",
];

// 表情覆蓋：以 {row: string} 取代整列
const MOODS = {
  neutral: {},
  happy: {
    9:  "..ksGLLLLLGsGLLLLLGssk..",
    10: "..ksGLeLLeGGGeLLeLGssk..",
    11: "..ksGLLeeLGsGLeeLLGssk..",
    16: "...kwwwwkmmmmmmkwwwwk...",
    17: "...kwwwwwkkkkkkwwwwwk...",
  },
  proud: {
    7:  "..kskkkkssssssskkkkssk..",
    10: "..ksGLeLLeGGGeLLeLGssk..",
    11: "..ksGLLeeLGsGLeeLLGssk..",
    16: "...kwwwkmmttttmmkwwwk...",
    17: "...kwwwwkkkkkkkkwwwwk...",
  },
  worried: {
    7:  "..kssssskkssssskksssssk.",
    16: "...kwwwwkwwkkwwkwwwwwk..",
    17: "...kwwwwwkkwwkkwwwwwk...",
  },
  stern: {
    7:  "..kskkksssssssssskkksk..",
    10: "..ksGLLeeLGGGLeeLLGssk..",
    16: "...kwwwwkkkkkkkkwwwwk...",
  },
  sleepy: {
    10: "..ksGLLLLLGGGLLLLLGssk..",
    11: "..ksGLeeeLGsGLeeeLGssk..",
    16: "...kwwwwwwkmmkwwwwwwk...",
  },
};

const BLINK_ROWS = {
  9:  "..ksGLLLLLGsGLLLLLGssk..",
  10: "..ksGLLLLLGGGLLLLLGssk..",
  11: "..ksGLeeeLGsGLeeeLGssk..",
};

export function spriteFor(mood = "neutral", blink = false) {
  const rows = BASE.slice();
  const ov = MOODS[mood] || {};
  for (const r in ov) rows[r] = ov[r];
  if (blink) for (const r in BLINK_ROWS) rows[r] = BLINK_ROWS[r];
  return rows;
}

export function drawGrid(canvas, rows, palette = PALETTE) {
  const h = rows.length, w = rows[0].length;
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = palette[rows[y][x]];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

/** 建立會眨眼的老師；回傳 {setMood, destroy} */
export function mountTeacher(canvas, mood = "neutral") {
  let cur = mood, timer = null, alive = true;
  const render = (blink = false) => drawGrid(canvas, spriteFor(cur, blink));
  const schedule = () => {
    if (!alive) return;
    timer = setTimeout(() => {
      render(true);
      setTimeout(() => { if (alive) { render(false); schedule(); } }, 140);
    }, 2200 + Math.random() * 2600);
  };
  render(false); schedule();
  return {
    setMood(m) { cur = MOODS[m] ? m : "neutral"; render(false); },
    destroy() { alive = false; clearTimeout(timer); },
  };
}

// ---------- 學生頭像（色塊 + 姓名首字；介面不走像素風）----------
const AVATAR_COLORS = {
  moss: "#2b6a50", clay: "#b9332c", ochre: "#b8862b", ink: "#2f3b4a", plum: "#6b3a5b", teal: "#2a6f7a",
};
export const AVATAR_KEYS = Object.keys(AVATAR_COLORS);
export const AVATAR_NAMES = { moss: "苔綠", clay: "朱紅", ochre: "赭黃", ink: "墨藍", plum: "紫檀", teal: "青瓷" };

export function avatarColor(key) { return AVATAR_COLORS[key] || AVATAR_COLORS.moss; }

/** 圓形頭像：顏色 + 稱呼第一個字 */
export function avatarEl(key, size = 32, name = "") {
  const d = document.createElement("span");
  d.className = "avatar";
  d.style.width = d.style.height = size + "px";
  d.style.fontSize = Math.round(size * 0.48) + "px";
  d.style.background = avatarColor(key);
  d.textContent = (name || "考").trim().slice(0, 1).toUpperCase();
  d.title = name;
  return d;
}

/** 選色用的色塊 */
export function swatchEl(key) {
  const d = document.createElement("span");
  d.className = "swatch";
  d.style.background = avatarColor(key);
  return d;
}
