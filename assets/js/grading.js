// 閱卷動畫（致敬逆轉裁判的「異議あり！」節奏）
// 流程：「閱卷！」字卡 → 老師在講桌批改 5 秒（紅筆在卷子上畫記）→ 試卷翻起 → 紅字手寫分數 + 底線 + 印章 → 按「確認」
import { mountTeacher } from "./pixel-teacher.js";

const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * @param {object} p
 * @param {number} p.score 0..100
 * @param {boolean} p.passed
 * @param {Array<{ok:boolean}>} p.marks 每題對錯
 * @param {string} p.studentName
 * @param {string} p.title 試卷標題
 * @returns {Promise<void>} 使用者按下確認後 resolve
 */
export function playGrading({ score, passed, marks, studentName, title }) {
  return new Promise(resolve => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ov = document.createElement("div");
    ov.className = "grading-overlay";
    ov.setAttribute("role", "dialog");
    ov.setAttribute("aria-label", "閱卷中");
    const total = marks.length;
    const scoreInt = Math.round(score);

    ov.innerHTML = `
      <div class="flash" aria-hidden="true">閱卷！</div>
      <div class="desk-scene">
        <div class="status">老學究老師閱卷中<span class="dots"></span></div>
        <div class="desk"></div>
        <canvas class="teacher"></canvas>
        <div class="sheet"><div class="marks">${marks.slice(0, 25).map(() => "<i></i>").join("")}</div></div>
        <div class="pen" style="right:28%;bottom:48%"></div>
      </div>
      <div class="paper-reveal">
        <div class="paper">
          <div class="paper-head">
            <h2>${escapeHtml(title)}</h2>
            <div class="meta"><span>考生：${escapeHtml(studentName)}</span><span>${new Date().toLocaleDateString("zh-TW")}</span></div>
          </div>
          <div class="paper-body">
            <div class="marks">${marks.map((m, i) => `<i class="${m.ok ? "ok" : ""}" title="第 ${i + 1} 題">${m.ok ? "○" : "✗"}</i>`).join("")}</div>
            <p class="muted">答對 ${marks.filter(m => m.ok).length} / ${total} 題</p>
          </div>
          <div class="score-box">
            <div class="score">${scoreInt}<small>分</small></div>
            <div class="underline"></div>
            <div class="underline second"></div>
          </div>
          <div class="stamp ${passed ? "gold" : ""}">${passed ? "合格" : "再接再厲"}</div>
          <div class="confirm"><button class="primary">確認</button></div>
        </div>
      </div>`;
    document.body.appendChild(ov);

    const canvas = ov.querySelector("canvas.teacher");
    const teacher = mountTeacher(canvas, "stern");
    const pen = ov.querySelector(".pen");
    const sheetMarks = ov.querySelectorAll(".sheet .marks i");
    const reveal = ov.querySelector(".paper-reveal");

    (async () => {
      await sleep(reduce ? 50 : 1400);          // 字卡
      const gradingMs = reduce ? 300 : 5000;    // 批改 5 秒
      const per = gradingMs / Math.max(1, sheetMarks.length);
      for (let i = 0; i < sheetMarks.length; i++) {
        const m = marks[i];
        sheetMarks[i].textContent = m.ok ? "○" : "✗";
        sheetMarks[i].classList.add("show");
        // 紅筆跟著移動
        const col = i % 5, row = Math.floor(i / 5);
        pen.style.right = `${34 - col * 5}%`;
        pen.style.bottom = `${58 - row * 7}%`;
        pen.style.transform = `rotate(${30 + (i % 2) * 14}deg)`;
        if (i % 6 === 5) teacher.setMood(m.ok ? "happy" : "worried");
        await sleep(per);
      }
      teacher.setMood(passed ? "proud" : "stern");
      await sleep(reduce ? 50 : 500);
      reveal.classList.add("on");
      ov.querySelector(".desk-scene").classList.add("dim");
      ov.querySelector(".paper .confirm button").addEventListener("click", () => {
        teacher.destroy();
        ov.remove();
        resolve();
      }, { once: true });
      ov.querySelector(".paper .confirm button").focus();
    })();
  });
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
