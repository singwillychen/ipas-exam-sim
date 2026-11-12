# 付費方案設計（封存：尚未實作於前端）

> 狀態：設計說明書。資料表與 RPC 以草稿形式放在 `supabase/migrations/draft/0100_billing.sql`，**尚未套用**到正式資料庫，前端也沒有任何付費 UI。

## 1. 定價

| 方案 | 代碼 | 價格 (TWD) | 內容 |
|---|---|---|---|
| 單次模擬考 | `single` | 30 | 1 張考券：一回完整模擬考（含閱卷、成績單、逐選項檢討、老師評語） |
| 五回合 | `pack5` | 50 | 5 張考券，等於每回 10 元 |
| 考前衝刺班 | `sprint` | 100 | 14 天內不限次數 + 弱項加重模式 + 每日老師晨間提醒（LLM）+ 衝刺報告 |

免費額度（建議）：註冊送 1 張考券；錯題本與五力圖永遠免費可看，讓使用者先感受價值再付費。

## 2. 成本結構（為什麼這樣定價）

| 項目 | 每回估算 |
|---|---|
| Supabase（免費方案內） | ≈ 0 元；超過 500 MB / 5 萬 MAU 再升級 Pro（USD 25/月） |
| MiniMax M2.7 老師評語 | 每次呼叫約 600–900 tokens（提示＋回應），依官方牌價約 USD 0.0005–0.001，一回模擬考約觸發 2–3 次 ≈ NT$0.1 |
| 題庫維護 | 固定成本，分攤 |

單次 30 元的毛利率高，核心成本其實是題庫品質與維護時間，而不是 token。

## 3. 計費模型：考券（credit）＋期間方案（pass）

兩種權益並存，開考時依序檢查：

1. 有效的 `sprint` pass（`expires_at > now()`）→ 直接放行
2. 否則扣 1 張考券（`credits_ledger` 餘額 > 0）→ 放行並記一筆 `-1`
3. 否則回傳 `PAYMENT_REQUIRED`，前端顯示方案

什麼算「一回」：呼叫 `start_exam` 成功就算，與題數無關（10 題暖身也算一回）。可改為只有 ≥25 題才計費，由 `billing_rules` 設定。

## 4. 資料表（草稿）

```
products          方案主檔：code, name, price_twd, credits, pass_days, active
orders            訂單：user_id, product_code, amount_twd, status(pending/paid/failed/refunded), provider, provider_ref, paid_at
credits_ledger    考券流水：user_id, delta(+5/-1), reason(purchase/consume/grant/refund), order_id, session_id
passes            期間方案：user_id, product_code, starts_at, expires_at, order_id
billing_rules     系統參數：free_credits_on_signup, min_questions_to_charge …
v_user_balance    view：每人目前考券餘額與有效 pass
```

RPC：
- `get_entitlement()` → `{credits, pass_until, can_start}`
- `consume_credit(session_id)`：由 `start_exam` 內部呼叫（security definer），交易內完成扣點
- `grant_credits(user_id, delta, reason)`：僅 admin
- `apply_payment(order_id, provider_ref)`：金流 webhook 用，冪等（同 provider_ref 只處理一次）

## 5. 金流接口（台灣）

建議順序：
1. **綠界 ECPay**（信用卡、ATM、超商代碼、LINE Pay 轉接），個人賣家可申請
2. **藍新 NewebPay**
3. **LINE Pay** 直接串接
4. 海外使用者：**Stripe**（已含 Apple Pay / Google Pay）

共通流程：

```
前端「購買」 → Edge Function create-order（建立 pending 訂單，產生金流表單/連結）
            → 使用者在金流頁付款
            → 金流伺服器呼叫 Edge Function payment-webhook（驗簽 → apply_payment → 發考券/pass）
            → 前端輪詢 get_entitlement 或收到 Realtime 通知 → 解鎖
```

Edge Function 需要的 secrets：`ECPAY_MERCHANT_ID`、`ECPAY_HASH_KEY`、`ECPAY_HASH_IV`（或對應金流商的金鑰）。一律放在 Supabase Secrets，與 `MINIMAX_API_KEY` 同一處。

## 6. 發票與稅務（提醒）

- 若以個人名義收款，年度門檻與營業登記請確認國稅局規定；穩定營收後建議以公司名義開電子發票（綠界、藍新皆有電子發票加值服務）。
- 可考慮用 Willy 的美國公司或台灣行號收款，兩者的稅務處理不同，先與會計師確認再開通金流。

## 7. 前端改動（未來）

- 書齋頁加「考券：N 張」與「衝刺班到期日」
- `start_exam` 回傳 `PAYMENT_REQUIRED` 時彈出方案卡（三個方案＋說明）
- 學籍頁加「購買紀錄」
- 管理員頁加「手動發放考券」（處理客服補償）

## 8. 啟用步驟（屆時）

1. 套用 `supabase/migrations/draft/0100_billing.sql`
2. 在 `start_exam` 前段加入 `perform public.consume_credit_or_pass(...)`（草稿內有範例）
3. 部署 `create-order`、`payment-webhook` 兩支 Edge Function
4. 前端加方案卡與餘額顯示
5. 用金流商的測試環境跑完整流程後再切正式

## 9. 風險與對策

| 風險 | 對策 |
|---|---|
| 使用者重新整理頁面造成重複扣點 | 扣點綁 `session_id`，同一 session 只扣一次 |
| Webhook 重送 | `provider_ref` 唯一鍵，冪等 |
| 退款 | `credits_ledger` 記負向 `refund`，pass 直接縮短 `expires_at` |
| 考券餘額被前端竄改 | 餘額只存在資料庫，由 RLS 保護；前端只讀 view |
