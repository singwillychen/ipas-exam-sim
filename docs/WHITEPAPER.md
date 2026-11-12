# iPAS 書齋 — 操作白皮書

> iPAS「AI應用規劃師」（初級／中級）模擬考系統。
> 版本 1.0 ・ 2026-11 ・ 作者：Willy Chen（與 Claude 協作）

---

## 1. 這套系統在解決什麼問題

準備 iPAS 證照時，多數人卡在三件事：

1. **不知道自己弱在哪**：刷題刷到麻木，但說不出是「資料處理」還是「導入風險」失分最多。
2. **錯題只看答案不看為什麼**：看到「答案 B」就翻頁，下次同樣的誘答選項照樣中招。
3. **練習沒有節奏**：沒有出席紀錄、沒有回饋，容易三天打魚兩天曬網。

iPAS 書齋把這三件事做成產品機制：

| 問題 | 機制 |
|---|---|
| 不知道弱在哪 | 每題都標記「評鑑主題／能力指標／能力面向」，作答後即時換算成**學習五力圖**與各主題正確率 |
| 錯題不會 | 每題四個選項都有獨立解析，說明「這個選項混淆了什麼概念」；錯題本自動收錄、答對後畢業 |
| 沒節奏 | 出席簿日曆、連續天數、累計時數；8-bit 老學究老師依你的數據說話（MiniMax M2.7 生成），交卷後有閱卷動畫與紅筆手寫分數 |

## 2. 系統總覽

```
┌─────────────────────────────┐      ┌───────────────────────────────────────┐
│  瀏覽器（GitHub Pages 靜態）  │      │  Supabase（ap-southeast-1）            │
│  index.html + assets/        │─────▶│  Auth（Email/密碼）                     │
│  純 HTML / CSS / ES Modules  │ RLS  │  Postgres：questions / exam_sessions / │
│  supabase-js（CDN）          │◀─────│           answers / profiles / views   │
│                              │      │  RPC：start_exam / submit_answer /     │
│  老師對話 ──────────────────┼─────▶│       finish_exam / get_dashboard …    │
│                              │      │  Edge Functions：teacher-say（MiniMax） │
│                              │      │                  import-questions       │
└─────────────────────────────┘      └───────────────────────────────────────┘
```

- **前端**不綁框架，部署在任何靜態空間（GitHub Pages、Zeabur、Oracle 主機的 nginx 皆可）。
- **資料庫**所有表都開 RLS；考生只讀得到自己的作答與統計。
- **題庫的答案與解析不對前端開放**：題目透過 `v_questions_public` view 取得（不含答案），批改一律經由 `submit_answer` RPC 在資料庫端完成。
- **LLM 金鑰只存在 Edge Function Secret**，前端與 repo 都沒有。

## 3. 考綱對應（五力圖怎麼算）

題庫依 iPAS 公開的評鑑主題編碼（`data/syllabus.json`），每題有 `topic`（如 L112）、`indicator`（如 L11201）與 `dimension`（五力圖軸）。

### 初級（L1）

| 面向 key | 名稱 | 對應主題 |
|---|---|---|
| ai_concept | AI 概念與治理 | L111 |
| data | 資料處理與分析 | L112 |
| ml_models | 機器學習與 AI 模型原理 | L113、L114 |
| genai_tools | 生成式 AI 工具與低程式碼 | L121、L122 |
| planning | 導入評估規劃與風險 | L123 |

### 中級（L2）

| 面向 key | 名稱 | 對應主題 |
|---|---|---|
| ai_apply | AI 技術應用情境 | L211 |
| ai_plan_risk | AI 規劃與風險治理 | L212、L213 |
| bigdata | 大數據處理與分析 | L221–L223 |
| ml_modeling | 機器學習建模與評估 | L231、L233 |
| deep_learning | 深度學習與特徵工程 | L232 |

五力圖每軸的分數 = 該面向歷史答題正確率（%）。紅色虛線為 70 分及格線。

> 官方考科代碼與子項若有更新，改 `data/syllabus.json` 即可，前端與出題皆以此檔為準。

## 4. 出題演算法

`start_exam(p_level, p_subjects[], p_count, p_mode, p_weak_weight)` 在 Postgres 內完成抽題：

| 模式 | 行為 |
|---|---|
| `random` | 純亂數，每題權重 1 |
| `weak` | 加權抽樣。每題權重 `w = 1 + k × (3 × 該主題錯誤率 + 2 × [此題最近一次答錯])`，k = 加重比例 (0–1)。k=1 時曾答錯且所屬主題全錯的題目權重最高 6 倍 |
| `wrong_only` | 只從「最近一次仍答錯」的題目抽 |

加權抽樣採 Efraimidis–Spirakis 法：每題 key = `random()^(1/w)`，取 key 最大的 N 題；不重複、一次 SQL 完成。

## 5. 資料模型

| 表 / View | 用途 |
|---|---|
| `profiles` | 稱呼、像素頭像、目標級別、應試日、`is_admin` |
| `questions` | 題庫（含答案與逐選項解析，RLS 不開放一般讀取） |
| `v_questions_public` | 題目公開欄位（無答案） |
| `exam_sessions` | 一次模擬考：級別、科目、模式、加重比例、題目順序、時間 |
| `answers` | 每題作答：選項、對錯、秒數 |
| `teacher_messages` | 老師說過的話（可回顧） |
| `v_user_dimension_stats` / `v_user_topic_stats` | 五力圖與主題正確率 |
| `v_user_daily` | 出席簿（Asia/Taipei 日界） |
| `v_wrong_book` | 錯題本（最近一次答錯） |

RPC：`start_exam`、`submit_answer`、`finish_exam`、`get_session_review`、`get_question_review`、`get_dashboard`。

## 6. 老學究老師（LLM 對話）

Edge Function `teacher-say` 接收 `context`（greeting / dashboard / result / wrong_review / idle）與使用者統計 JSON，組成 system prompt 呼叫 MiniMax（OpenAI 相容端點 `/v1/chat/completions`，預設模型 `MiniMax-M2.7`），要求：

- 繁體中文、一到兩句、60 字內、不條列
- 末行輸出 `MOOD: happy|proud|neutral|worried|stern|sleepy`，前端據此切換像素表情

沒有金鑰、逾時（20 秒）或回應異常時自動退回內建語錄，系統不會因此掛掉。回應中 `model` 欄位可看出是 `MiniMax-M2.7` 還是 `builtin`。

環境變數（Supabase → Edge Functions → Secrets）：`MINIMAX_API_KEY`（必要）、`MINIMAX_MODEL`、`MINIMAX_BASE_URL`（選填）。

## 7. 閱卷動畫

交卷後：
1. 「閱卷！」字卡（致敬逆轉裁判的節奏）
2. 老師在講桌批改 5 秒，紅筆逐題畫 ○／✗，表情隨對錯變化
3. 試卷翻起，紅字手寫分數（Long Cang 手寫字型）逐筆寫出，畫兩道底線，蓋「合格」或「再接再厲」章
4. 按「確認」進入成績單

`prefers-reduced-motion` 開啟時全程縮短為 0.5 秒內。

## 8. 安全設計

- 所有表開 RLS；`answers`、`exam_sessions` 只能讀自己的。
- 寫入一律走 `security definer` RPC，RPC 內以 `auth.uid()` 檢查歸屬；偽造 session_id 會被拒。
- `questions` 無公開 select policy，防止前端直接撈答案。
- Edge Functions 預設 `verify_jwt = true`；`import-questions` 另檢查 `profiles.is_admin`。
- LLM 金鑰僅存 Secrets；repo 內 `.gitignore` 排除 `.env*`。
- anon key 本就是公開金鑰，安全性由 RLS 承擔，不是由金鑰保密承擔。

## 9. 維護與擴充

| 想做的事 | 怎麼做 |
|---|---|
| 新增／修改題目 | 依 `data/QUESTION_SCHEMA.md` 編輯 JSON → 管理員在「題庫」頁匯入，或執行 `scripts/import_questions.sh` |
| 調整五力圖軸 | 改 `data/syllabus.json` 的 `dimensions`，同時確認題目的 `dimension` 欄位一致 |
| 換 LLM | 任何 OpenAI 相容端點都可：改 Secrets 的 `MINIMAX_BASE_URL` / `MINIMAX_MODEL` / `MINIMAX_API_KEY` |
| 加管理員 | SQL：`update public.profiles set is_admin = true where id = '<uuid>'` |
| 新增 RPC / 表 | 在 `supabase/migrations/` 加新檔，用 Supabase MCP 或 SQL Editor 套用 |
| 換部署位置 | 整個 repo 是靜態檔，丟到任何 web server；只需確認 Supabase Auth 的 Site URL / Redirect URLs 加上新網址 |

## 10. 已知限制

- 題庫為 AI 協助產生的原創模擬題（初級 120 題、中級 75 題），非官方試題；上線前建議人工抽查法規類題目（個資法、EU AI Act）。
- 中級正式考試 L22／L23 擇一，系統允許同時勾選練習。
- Email 註冊若 Supabase 開啟「確認信」，需點信箱連結才能登入；可在 Supabase Auth 設定關閉。
- 老師對話由 LLM 生成，偶爾會有不精確的措辭；它只讀統計數字，不會看到題目內容。

## 11. 目錄結構

```
ipas-exam-sim/
├── index.html                  入口
├── assets/
│   ├── css/style.css           像素風樣式
│   ├── js/app.js               路由與各頁面
│   ├── js/api.js               Supabase 存取層
│   ├── js/pixel-teacher.js     老師與頭像像素圖
│   ├── js/charts.js            五力圖、出席簿
│   ├── js/grading.js           閱卷動畫
│   ├── js/config.js            公開設定
│   └── fonts/Cubic_11.woff2    俐方體 11 號（OFL）
├── data/
│   ├── syllabus.json           考綱與五力圖定義
│   ├── QUESTION_SCHEMA.md      題庫格式
│   └── questions/*.json        題庫
├── supabase/
│   ├── migrations/             資料庫結構
│   ├── functions/teacher-say   老師對話 Edge Function
│   ├── functions/import-questions
│   └── seed/                   由 scripts 產生的 SQL（備援匯入）
├── scripts/                    匯入工具
├── tests/                      Playwright 端對端、API 安全測試
└── docs/                       本白皮書與快速上手
```
