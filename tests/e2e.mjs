// 端對端走查：登入 → 書齋 → 設定考試 → 作答 → 交卷（閱卷動畫）→ 成績單 → 檢討 → 錯題本
// 用法：node tests/e2e.mjs  （需要 .env.local 內的 QA 帳號；會啟動本機 http server）
import { chromium } from "/tmp/pw/node_modules/playwright/index.mjs";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(new URL(".", import.meta.url).pathname, "..");
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n").filter(l => l.includes("=")).map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const PORT = 8765;
const OUT = path.join(ROOT, "tests", "shots");
fs.mkdirSync(OUT, { recursive: true });

const server = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], { cwd: ROOT, stdio: "ignore" });
await new Promise(r => setTimeout(r, 800));

const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const browser = await chromium.launch({ proxy: proxy ? { server: proxy, bypass: "127.0.0.1,localhost" } : undefined });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 900 }, locale: "zh-TW", timezoneId: "Asia/Taipei" });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", e => errors.push("pageerror: " + e.message));
page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
page.on("requestfailed", r => errors.push("reqfail: " + r.url() + " " + r.failure()?.errorText));

const shot = async (name) => { await page.screenshot({ path: path.join(OUT, name + ".png"), fullPage: true }); console.log("📸", name); };
const step = (s) => console.log("▶", s);

try {
  step("open login");
  await page.goto(`http://127.0.0.1:${PORT}/#/login`, { waitUntil: "networkidle" });
  await page.waitForSelector("#f-in", { timeout: 20000 });
  await shot("01-login");

  step("sign in");
  await page.fill("#in-email", env.QA_ADMIN_EMAIL);
  await page.fill("#in-pw", env.QA_ADMIN_PASSWORD);
  await page.click("#f-in button[type=submit]");
  await page.waitForSelector("#radar svg", { timeout: 30000 });
  await page.waitForTimeout(2500);
  await shot("02-dashboard");

  step("exam setup");
  await page.click('button[data-go="/exam/setup"]');
  await page.waitForSelector("#start");
  // 10 題、弱項加重 70%
  await page.click('#count .choice:has(input[value="10"])');
  await page.click('#mode .choice:has(input[value="weak"])');
  await page.fill("#weak", "70");
  await shot("03-setup");
  await page.click("#start");
  await page.waitForSelector(".opt", { timeout: 30000 });
  await shot("04-exam");

  step("answer 10 questions");
  const n = await page.locator("#navgrid button").count();
  for (let i = 0; i < n; i++) {
    const k = "ABCD"[(i * 7) % 4];
    await page.click(`.opt[data-k="${k}"]`);
    if (i < n - 1) await page.click("#next");
  }
  await shot("05-exam-answered");

  step("submit → grading animation");
  page.once("dialog", d => d.accept());
  await page.click("#submit");
  await page.waitForSelector(".grading-overlay", { timeout: 30000 });
  await page.waitForTimeout(1600);
  await shot("06-grading-flash");
  await page.waitForTimeout(3000);
  await shot("07-grading-desk");
  await page.waitForSelector(".paper-reveal.on", { timeout: 30000 });
  await page.waitForTimeout(3200);
  await shot("08-grading-paper");
  await page.click(".paper .confirm button");
  await page.waitForSelector(".score-big", { timeout: 30000 });
  await page.waitForTimeout(2500);
  await shot("09-result");

  step("review");
  await page.click('button[data-go^="/review/"]');
  await page.waitForSelector("#list", { timeout: 30000 });
  await page.waitForTimeout(1500);
  await shot("10-review");

  step("wrong book");
  await page.goto(`http://127.0.0.1:${PORT}/#/wrongbook`);
  await page.waitForSelector("#list", { timeout: 30000 });
  const det = page.locator("details").first();
  if (await det.count()) { await det.locator("summary").click(); await page.waitForTimeout(1500); }
  await shot("11-wrongbook");

  step("dashboard again (radar should have data)");
  await page.goto(`http://127.0.0.1:${PORT}/#/`);
  await page.waitForSelector("#radar svg", { timeout: 30000 });
  await page.waitForTimeout(3000);
  await shot("12-dashboard-after");

  step("history + profile + admin");
  await page.goto(`http://127.0.0.1:${PORT}/#/history`); await page.waitForSelector(".sessions"); await shot("13-history");
  await page.goto(`http://127.0.0.1:${PORT}/#/profile`); await page.waitForSelector("#save"); await shot("14-profile");
  await page.goto(`http://127.0.0.1:${PORT}/#/admin`); await page.waitForSelector("#import"); await shot("15-admin");

  step("mobile dashboard");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`http://127.0.0.1:${PORT}/#/`); await page.waitForSelector("#radar svg"); await page.waitForTimeout(2500); await shot("16-mobile-dashboard");
} catch (e) {
  console.error("❌", e.message);
  await shot("99-failure");
  process.exitCode = 1;
} finally {
  const filtered = errors.filter(e => !/favicon|fonts\.gstatic|ERR_ABORTED/.test(e));
  console.log(filtered.length ? "⚠ errors:\n" + filtered.join("\n") : "✅ no page errors");
  await browser.close();
  server.kill();
}
