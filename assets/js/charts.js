// 五力圖（SVG 雷達）與出席日曆
const NS = "http://www.w3.org/2000/svg";
const el = (tag, attrs = {}, children = []) => {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  for (const c of children) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  return n;
};

/**
 * dims: [{key,name}], values: {key: 0..100 | null}, attempts: {key: n}
 */
export function radarSVG(dims, values, attempts = {}) {
  const size = 480, cx = size / 2, cy = size / 2 + 10, R = 140;
  const n = dims.length;
  const ang = i => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pt = (i, r) => [cx + r * Math.cos(ang(i)), cy + r * Math.sin(ang(i))];
  const svg = el("svg", { viewBox: `0 0 ${size} ${size}`, role: "img", "aria-label": "學習五力圖" });

  // 網格（階梯狀像素感：用多邊形 + 粗線）
  [20, 40, 60, 80, 100].forEach(lv => {
    const r = (R * lv) / 100;
    const pts = dims.map((_, i) => pt(i, r).join(",")).join(" ");
    svg.appendChild(el("polygon", { points: pts, fill: lv === 100 ? "#fffdf7" : "none", stroke: lv === 70 ? "#c8322b" : "#d9c9a3", "stroke-width": lv === 100 ? 3 : 2, "stroke-dasharray": lv === 100 ? "" : "4 3" }));
  });
  // 70 分及格線
  {
    const r = (R * 70) / 100;
    const pts = dims.map((_, i) => pt(i, r).join(",")).join(" ");
    svg.appendChild(el("polygon", { points: pts, fill: "none", stroke: "#c8322b", "stroke-width": 2, "stroke-dasharray": "6 4", opacity: .8 }));
  }
  // 軸線
  dims.forEach((_, i) => {
    const [x, y] = pt(i, R);
    svg.appendChild(el("line", { x1: cx, y1: cy, x2: x, y2: y, stroke: "#1b1b1f", "stroke-width": 2 }));
  });
  // 資料多邊形
  const vals = dims.map(d => (values[d.key] ?? 0));
  const dataPts = dims.map((_, i) => pt(i, (R * Math.max(0, Math.min(100, vals[i]))) / 100));
  svg.appendChild(el("polygon", { points: dataPts.map(p => p.join(",")).join(" "), fill: "rgba(200,50,43,.28)", stroke: "#c8322b", "stroke-width": 4, "stroke-linejoin": "miter" }));
  dataPts.forEach((p, i) => {
    const has = values[dims[i].key] != null;
    svg.appendChild(el("rect", { x: p[0] - 6, y: p[1] - 6, width: 12, height: 12, fill: has ? "#c8322b" : "#d9c9a3", stroke: "#1b1b1f", "stroke-width": 2 }));
  });
  // 標籤
  dims.forEach((d, i) => {
    const [x, y] = pt(i, R + 30);
    const anchor = Math.abs(Math.cos(ang(i))) < 0.2 ? "middle" : Math.cos(ang(i)) > 0 ? "start" : "end";
    const g = el("g", { "font-family": "'Cubic 11','Noto Sans TC',monospace", "text-anchor": anchor });
    g.appendChild(el("text", { x, y: y - 4, "font-size": 15, fill: "#1b1b1f" }, [d.short || d.name]));
    const v = values[d.key];
    g.appendChild(el("text", { x, y: y + 14, "font-size": 15, fill: v == null ? "#8a8070" : v >= 70 ? "#2f7a4a" : "#c8322b" }, [v == null ? "尚無" : `${Math.round(v)}分`]));
    svg.appendChild(g);
  });
  return svg;
}

/** days: [{day:'YYYY-MM-DD', answered, correct, seconds}] ; ym: Date for month */
export function calendarEl(days, ym, onNav) {
  const map = Object.fromEntries(days.map(d => [d.day, d]));
  const wrap = document.createElement("div");
  const y = ym.getFullYear(), m = ym.getMonth();
  const first = new Date(y, m, 1), last = new Date(y, m + 1, 0);
  const todayStr = localDateStr(new Date());
  const head = document.createElement("div");
  head.className = "cal-head";
  head.innerHTML = `<button class="small ghost" data-nav="-1" aria-label="上個月">◀</button><h3>${y} 年 ${m + 1} 月 出席簿</h3><button class="small ghost" data-nav="1" aria-label="下個月">▶</button>`;
  head.querySelectorAll("button").forEach(b => b.addEventListener("click", () => onNav(Number(b.dataset.nav))));
  wrap.appendChild(head);
  const grid = document.createElement("div");
  grid.className = "cal";
  ["日", "一", "二", "三", "四", "五", "六"].forEach(d => { const s = document.createElement("div"); s.className = "dow"; s.textContent = d; grid.appendChild(s); });
  for (let i = 0; i < first.getDay(); i++) { const e = document.createElement("div"); e.className = "day empty"; grid.appendChild(e); }
  let doneCount = 0;
  for (let d = 1; d <= last.getDate(); d++) {
    const ds = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const cell = document.createElement("div");
    cell.className = "day";
    cell.textContent = d;
    const rec = map[ds];
    if (rec && rec.answered > 0) {
      doneCount++;
      cell.classList.add("done");
      if (rec.answered >= 50) cell.classList.add("l3"); else if (rec.answered >= 20) cell.classList.add("l2");
      cell.title = `${ds}：答 ${rec.answered} 題，對 ${rec.correct} 題，${Math.round(rec.seconds / 60)} 分鐘`;
    }
    if (ds === todayStr) cell.classList.add("today");
    grid.appendChild(cell);
  }
  wrap.appendChild(grid);
  const foot = document.createElement("p");
  foot.className = "hint";
  foot.textContent = `本月出席 ${doneCount} 天（有作答就算出席；顏色越深代表當天題數越多）`;
  wrap.appendChild(foot);
  return wrap;
}

export function localDateStr(d) {
  const tz = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return tz.toISOString().slice(0, 10);
}

export function fmtDuration(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (h) return `${h} 小時 ${m} 分`;
  if (m) return `${m} 分 ${s} 秒`;
  return `${s} 秒`;
}
