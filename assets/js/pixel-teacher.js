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

// ---------- 學生像素頭像（16 x 16）----------
const AVATARS = {
  cat: [
    "..k..........k..",
    ".kok........kok.",
    ".koook....koook.",
    "kooooookkooooook",
    "koooooooooooooook".slice(0,16),
    "koowkoooooookwook".slice(0,16),
    "kooooooooooooook",
    "koooookpppkooook",
    ".koooooooooooook".slice(0,16),
    ".kooookkkkooook.",
    "..kooooooooook..",
    "...kkkkkkkkkk...",
    "....kbbbbbbk....",
    "...kbbbbbbbbk...",
    "...kbbbbbbbbk...",
    "...kkkkkkkkkk...",
  ],
  owl: [
    "....kk....kk....",
    "...kwwk..kwwk...",
    "..kwwwwkkwwwwk..",
    ".kwwkkwwwwkkwwk.",
    ".kwkeekwwkeekwk.",
    ".kwkeekwwkeekwk.",
    ".kwwkkwkkwkkwwk.",
    ".kwwwwkggkwwwwk.",
    "..kwwwwwwwwwwk..",
    "..kbwbwbwbwbwk..",
    "..kwbwbwbwbwbk..",
    "..kbwbwbwbwbwk..",
    "...kwwwwwwwwk...",
    "....kkkkkkkk....",
    "...kggk..kggk...",
    "...kkkk..kkkk...",
  ],
  fox: [
    ".k............k.",
    ".kok..........kok".slice(0,16),
    ".krook......koork".slice(0,16),
    ".krroookkkkooorrk".slice(0,16),
    "krrrroooooooorrrk".slice(0,16),
    "krrrrwooooowrrrrk".slice(0,16),
    "krrrkwwoookwwrrrk".slice(0,16),
    ".krrrwwookwwrrrk".slice(0,16),
    ".krrrrwwkwwrrrrk",
    "..krrrrwwwrrrrk.",
    "...krrrwkwrrrk..",
    "....kkkkkkkkk...",
    "....kbbbbbbbk...",
    "...kbbbbbbbbbk..",
    "...kbbbbbbbbbk..",
    "...kkkkkkkkkkk..",
  ],
  robot: [
    ".......kk.......",
    ".......kk.......",
    "...kkkkkkkkkk...",
    "..kggggggggggk..",
    "..kgkLLkggkLLkgk".slice(0,16),
    "..kgkLekggkLekgk".slice(0,16),
    "..kgkkkkggkkkkgk".slice(0,16),
    "..kggggggggggk..",
    "..kgkrrrrrrkgk..",
    "..kggkkkkkkggk..",
    "...kkkkkkkkkk...",
    ".kkkkbbbbbbkkkk.",
    ".kggkbbbbbbkggk.",
    ".kggkbbbbbbkggk.",
    "....kbbbbbbk....",
    "....kkkkkkkk....",
  ],
  panda: [
    "..kkk......kkk..",
    ".kkkkk....kkkkk.",
    ".kkkwwwwwwwwkkk.",
    "..kwwwwwwwwwwk..",
    ".kwwkkkwwkkkwwk.",
    ".kwkkeekwwkeekwk".slice(0,16),
    ".kwkkkkkwwkkkkwk".slice(0,16),
    ".kwwwwwwkkwwwwwk".slice(0,16),
    ".kwwwwwkkkkwwwwk".slice(0,16),
    "..kwwwwwwwwwwk..",
    "...kwwwwwwwwk...",
    "....kkkkkkkk....",
    "...kkkbbbbkkk...",
    "..kkkbbbbbbkkk..",
    "..kkkbbbbbbkkk..",
    "...kkkkkkkkkk...",
  ],
  frog: [
    "...kkk....kkk...",
    "..kwwwk..kwwwk..",
    "..kwekk..kkewk..",
    ".kkwwwkkkkwwwkk.",
    "kooooooooooooook",
    "kooooooooooooook",
    "koooooooooooooook".slice(0,16),
    "kookooooooooookok".slice(0,16),
    ".kookkkkkkkkkook".slice(0,16),
    ".koooooooooooook".slice(0,16),
    "..kooooooooook..",
    "...kkkkkkkkkk...",
    "....kbbbbbbk....",
    "...kbbbbbbbbk...",
    "...kbbbbbbbbk...",
    "...kkkkkkkkkk...",
  ],
};
const AVATAR_PAL = {
  ".": null, k: "#1b1b1f", o: "#f0b45c", w: "#f7f3e8", e: "#1b1b1f", p: "#e8a3a3", b: "#2b3f6b", r: "#d9622b", g: "#9aa3ad", L: "#e3f4ff",
};
const AVATAR_PAL_OVERRIDES = { frog: { o: "#6fbf5a" }, cat: { o: "#f0b45c" } };

export const AVATAR_KEYS = Object.keys(AVATARS);
export const AVATAR_NAMES = { cat: "橘貓", owl: "貓頭鷹", fox: "狐狸", robot: "機器人", panda: "熊貓", frog: "青蛙" };

export function drawAvatar(canvas, key = "cat") {
  const rows = (AVATARS[key] || AVATARS.cat).map(r => r.padEnd(16, ".").slice(0, 16));
  drawGrid(canvas, rows, { ...AVATAR_PAL, ...(AVATAR_PAL_OVERRIDES[key] || {}) });
}

export function avatarEl(key, size = 32) {
  const c = document.createElement("canvas");
  c.style.width = c.style.height = size + "px";
  c.className = "avatar-mini";
  drawAvatar(c, key);
  return c;
}
