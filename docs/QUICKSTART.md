# iPAS 書齋 — 簡易操作書

## 考生 5 分鐘上手

1. **開啟網站** → 點「註冊新學籍」：填稱呼、挑一個像素頭像、選目標級別（初級／中級）、Email 與密碼。
   若信箱收到確認信，點連結後回來登入。
2. **書齋（首頁）**：老學究老師會用一句話告訴你現況；下面是四格統計、學習五力圖、出席簿日曆、最近考卷。
3. **模擬考**：
   - 級別 → 科目（可複選）→ 題數（10／25／50）
   - 出題方式：**純亂數**、**弱項加重**（拉桿 0–100%，越高越常抽到你錯過的題與弱主題）、**只練錯題**
   - 計時：依官方節奏（初級 1.5 分鐘／題、中級 1.8 分鐘／題）或不計時
4. **作答**：點選項或按鍵盤 A/B/C/D（或 1–4），← → 換題，可「標記待確認」，答題卡可跳題。
5. **交卷**：看老師閱卷 5 秒 → 試卷翻起、紅筆寫分數、蓋章 → 按「確認」。
6. **成績單**：分數、各面向正確率、最常失分主題 → 「逐題檢討」看每個選項為什麼對、為什麼錯。
7. **錯題本**：所有「最近一次仍答錯」的題目，依主題篩選，點開看解析；「錯題重練 10 題」直接開考。
8. **成績簿**：所有考卷紀錄，可回看成績單與檢討。
9. **學籍**：改稱呼、頭像、目標級別（影響五力圖與錯題本顯示的級別）、預計應試日。

小提醒：有作答的那天會在出席簿打勾；連續天數顯示在首頁。每天 10 題就能保持連續。

---

## 管理者：從零部署（約 20 分鐘）

### A. Supabase

1. 到 supabase.com 建立專案（免費方案即可，區域選 Singapore）。
2. SQL Editor 依序貼上執行：
   - `supabase/migrations/0001_init.sql`
   - `supabase/migrations/0002_admin.sql`
3. Authentication → Providers → Email：依需求決定是否關閉「Confirm email」。
   Authentication → URL Configuration：Site URL 與 Redirect URLs 填你的網站網址（例如 `https://<帳號>.github.io/ipas-exam-sim/`）。
4. Edge Functions：用 Supabase CLI 部署
   ```bash
   supabase functions deploy teacher-say
   supabase functions deploy import-questions
   ```
   或在 Dashboard → Edge Functions 手動貼上 `supabase/functions/*/index.ts`。
5. Edge Functions → Secrets 新增：
   - `MINIMAX_API_KEY`＝你的 MiniMax 金鑰（**只放這裡**，不要放進程式或 GitHub）
   - 選填 `MINIMAX_MODEL`（預設 `MiniMax-M2.7`）、`MINIMAX_BASE_URL`（預設 `https://api.minimax.io/v1`）
6. 把自己設成管理員：先在網站註冊一個帳號，然後 SQL Editor 執行
   ```sql
   update public.profiles set is_admin = true
   where id = (select id from auth.users where email = '你的email');
   ```

### B. 前端設定

編輯 `assets/js/config.js`，填入 Project Settings → API 的 **Project URL** 與 **anon / publishable key**。

### C. 匯入題庫

兩種方式擇一：

- 網站右上「題庫」頁（管理員才看得到）→ 選取 `data/questions/*.json` → 匯入。
- 終端機：複製 `.env.example` 為 `.env.local`，填 `SUPABASE_URL`、`SUPABASE_ANON_KEY`、`ADMIN_EMAIL`、`ADMIN_PASSWORD`，執行 `./scripts/import_questions.sh`。

### D. 發佈

- **GitHub Pages**：Settings → Pages → Source 選 `main` 分支、資料夾 `/ (root)`。
- **自架（Zeabur / Oracle / nginx）**：整個資料夾就是靜態站，直接 serve。

### E. 驗證

- 註冊 → 考 10 題 → 交卷看到閱卷動畫 → 首頁五力圖有數字。
- 老師對話框右下「再說一句」：回應若來自 MiniMax，對話會有變化；若一直是固定句子，檢查 Secrets 是否設定（Edge Function 回傳的 `model` 欄位為 `builtin` 代表未啟用 LLM）。

---

## 常見問題

| 狀況 | 處理 |
|---|---|
| 登入說 Email 未確認 | 到信箱點確認連結，或在 Supabase Auth 關閉 Confirm email |
| 出題失敗「no questions available」 | 題庫尚未匯入，或所選科目／錯題本沒有題目 |
| 老師只會講固定幾句 | 未設定 `MINIMAX_API_KEY`，或金鑰無效（看 Edge Function logs） |
| 想改題目 | 改 `data/questions/*.json`（同 id 會覆寫）→ 重新匯入 |
| 想加題目 | 新增 JSON 檔，id 用 `{科目}-{流水號}`，欄位見 `data/QUESTION_SCHEMA.md` |
| 五力圖某軸永遠「尚無」 | 該面向對應的主題還沒出現過題目；多考幾回或檢查 `dimension` 欄位 |
