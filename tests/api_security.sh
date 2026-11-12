#!/usr/bin/env bash
# iPAS 模擬考 API 安全與契約測試（bash + curl + python3）
# 用法：bash tests/api_security.sh   （需要 .env.local 內含 SUPABASE_URL / SUPABASE_ANON_KEY / QA_ADMIN_EMAIL / QA_ADMIN_PASSWORD）
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
set -a; . "$ROOT/.env.local"; set +a

PASS=0; FAIL=0
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
HTTP=""; RESP=""

# call METHOD URL TOKEN BODY  -> 設定 HTTP、RESP；TOKEN 為空則不帶 Authorization
call() {
  local method="$1" url="$2" token="$3" body="${4:-}"
  local args=(-sS -o "$TMP/body" -w '%{http_code}' -X "$method" "$url"
              -H "apikey: $SUPABASE_ANON_KEY" -H "Content-Type: application/json")
  [ -n "$token" ] && args+=(-H "Authorization: Bearer $token")
  [ -n "$body" ] && args+=(--data "$body")
  HTTP="$(curl "${args[@]}" 2>/dev/null)" || HTTP="000"
  RESP="$(cat "$TMP/body" 2>/dev/null)"
}

# pyq PYTHON_EXPR：以 RESP 為 JSON 執行表達式（變數 d），印出結果
pyq() { printf '%s' "$RESP" | python3 -I -c "import json,sys
try:
    d=json.load(sys.stdin)
except Exception:
    d=None
$1"; }

report() { # NAME RESULT(PASS|FAIL|INFO) DETAIL
  case "$2" in
    PASS) PASS=$((PASS+1));;
    FAIL) FAIL=$((FAIL+1));;
  esac
  printf '[%s] %s | HTTP %s | %s\n' "$2" "$1" "$HTTP" "$3"
}
short() { printf '%s' "$RESP" | head -c 160 | tr '\n' ' '; }

R="$SUPABASE_URL/rest/v1"
F="$SUPABASE_URL/functions/v1"
START_BODY='{"p_level":"L1","p_subjects":["L11"],"p_count":3,"p_mode":"random","p_weak_weight":0}'

# ---- 登入取得 access_token ----
LOGIN_BODY="$(python3 -I -c 'import json,os;print(json.dumps({"email":os.environ["QA_ADMIN_EMAIL"],"password":os.environ["QA_ADMIN_PASSWORD"]}))')"
AUTH_JSON="$(curl -sS -X POST "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Content-Type: application/json" --data "$LOGIN_BODY" 2>/dev/null)"
TOKEN="$(printf '%s' "$AUTH_JSON" | python3 -I -c 'import json,sys
try: print(json.load(sys.stdin).get("access_token",""))
except Exception: print("")')"
if [ -z "$TOKEN" ]; then
  echo "[FAIL] 登入 QA 帳號失敗，無法執行已登入測試"; exit 1
fi
echo "登入成功（token 已取得，未輸出）"
echo

# ---- a. 匿名呼叫 start_exam ----
call POST "$R/rpc/start_exam" "" "$START_BODY"
if [ "$HTTP" != "200" ] || printf '%s' "$RESP" | grep -qi "not authenticated"; then
  report "a 匿名 start_exam 應失敗" PASS "$(short)"
else
  report "a 匿名 start_exam 應失敗" FAIL "匿名竟然拿到 200：$(short)"
fi

# ---- b. 匿名讀題庫 ----
call GET "$R/questions?select=id,answer&limit=1" ""
if [ "$HTTP" = "401" ] || [ "$HTTP" = "403" ] || { [ "$HTTP" = "200" ] && [ "$RESP" = "[]" ]; }; then
  report "b 匿名讀 questions 無資料" PASS "$(short)"
else
  report "b 匿名讀 questions 無資料" FAIL "回傳非預期內容：$(short)"
fi

# ---- c1. 已登入讀 questions（QA 為 admin，允許與否都記錄） ----
call GET "$R/questions?select=id,answer&limit=1" "$TOKEN"
report "c1 已登入讀 questions（QA 為 admin，僅記錄）" INFO "$(short)"

# ---- c2. 已登入讀 v_questions_public，不得含 answer/explanation/option_analysis ----
call GET "$R/v_questions_public?select=*&limit=1" "$TOKEN"
C2_HTTP="$HTTP"; C2_RESP="$RESP"
LEAK="$(printf '%s' "$C2_RESP" | python3 -I -c 'import json,sys
bad={"answer","explanation","option_analysis"}
try: d=json.load(sys.stdin)
except Exception: print("parse-error"); raise SystemExit
if not isinstance(d,list): print("non-list"); raise SystemExit
if not d: print("empty"); raise SystemExit
print(",".join(sorted(bad & set(d[0].keys()))) or "none")')"
if [ "$C2_HTTP" = "200" ] && [ "$LEAK" = "none" ]; then
  report "c2 v_questions_public 不含答案欄位" PASS "欄位檢查：無洩漏"
elif [ "$LEAK" = "empty" ]; then
  report "c2 v_questions_public 不含答案欄位" FAIL "回傳空陣列，無法驗證欄位（題庫為空？）"
else
  report "c2 v_questions_public 不含答案欄位" FAIL "HTTP $C2_HTTP，洩漏欄位：$LEAK"
fi

# ---- c3. 已登入以 select=answer 直接查 view，應被拒（欄位不存在）或無資料 ----
call GET "$R/v_questions_public?select=answer&limit=1" "$TOKEN"
if [ "$HTTP" != "200" ] || [ "$RESP" = "[]" ]; then
  report "c3 v_questions_public 指定 answer 欄位應被拒" PASS "$(short)"
else
  report "c3 v_questions_public 指定 answer 欄位應被拒" FAIL "竟回傳資料：$(short)"
fi
echo

# ---- d. 已登入完整流程 ----
call POST "$R/rpc/start_exam" "$TOKEN" "$START_BODY"
D_HTTP="$HTTP"
read -r SID QID1 NQ <<<"$(printf '%s' "$RESP" | python3 -I -c 'import json,sys
d=json.load(sys.stdin)
row=d[0] if isinstance(d,list) and d else (d if isinstance(d,dict) else {})
q=row.get("question_ids") or []
print(row.get("session_id") or "-", q[0] if q else "-", len(q))' 2>/dev/null || echo "- - 0")"
if [ "$D_HTTP" = "200" ] && [ "$SID" != "-" ] && [ "$NQ" = "3" ]; then
  report "d1 start_exam 回傳 session_id 與 3 題" PASS "session=${SID:0:8}…，題數=$NQ"
else
  report "d1 start_exam 回傳 session_id 與 3 題" FAIL "session=$SID，題數=$NQ，$(short)"
fi

if [ "$QID1" != "-" ]; then
  call POST "$R/rpc/submit_answer" "$TOKEN" "{\"p_session_id\":\"$SID\",\"p_question_id\":\"$QID1\",\"p_chosen\":\"A\",\"p_time_spent\":5}"
  SUB_OK="$(printf '%s' "$RESP" | python3 -I -c 'import json,sys
try: d=json.load(sys.stdin)
except Exception: print("no"); raise SystemExit
need={"is_correct","answer","option_analysis"}
print("yes" if isinstance(d,dict) and need<=set(d.keys()) else "no")')"
  if [ "$HTTP" = "200" ] && [ "$SUB_OK" = "yes" ]; then
    report "d2 submit_answer 回傳 is_correct/answer/option_analysis" PASS "$(short)"
  else
    report "d2 submit_answer 回傳 is_correct/answer/option_analysis" FAIL "$(short)"
  fi
else
  report "d2 submit_answer" FAIL "沒有 question_id 可測"
fi

FAKE_SID="$(python3 -I -c 'import uuid;print(uuid.uuid4())')"
call POST "$R/rpc/submit_answer" "$TOKEN" "{\"p_session_id\":\"$FAKE_SID\",\"p_question_id\":\"${QID1}\",\"p_chosen\":\"A\",\"p_time_spent\":1}"
if [ "$HTTP" != "200" ]; then
  report "d3 假 session_id 呼叫 submit_answer 應失敗" PASS "$(short)"
else
  report "d3 假 session_id 呼叫 submit_answer 應失敗" FAIL "竟成功：$(short)"
fi

if [ "$SID" != "-" ]; then
  call POST "$R/rpc/finish_exam" "$TOKEN" "{\"p_session_id\":\"$SID\"}"
  if [ "$HTTP" = "200" ] && printf '%s' "$RESP" | grep -q '"score"'; then
    report "d4 finish_exam 回傳 score" PASS "$(short)"
  else
    report "d4 finish_exam 回傳 score" FAIL "$(short)"
  fi
fi

# ---- e. p_count 邊界 ----
for n in 0 101; do
  call POST "$R/rpc/start_exam" "$TOKEN" "{\"p_level\":\"L1\",\"p_subjects\":[\"L11\"],\"p_count\":$n,\"p_mode\":\"random\",\"p_weak_weight\":0}"
  if [ "$HTTP" != "200" ]; then
    report "e p_count=$n 應回錯誤" PASS "$(short)"
  else
    report "e p_count=$n 應回錯誤" FAIL "竟回 200：$(short)"
  fi
done

# ---- f. weak 模式 ----
call POST "$R/rpc/start_exam" "$TOKEN" '{"p_level":"L1","p_subjects":["L11"],"p_count":3,"p_mode":"weak","p_weak_weight":100}'
if [ "$HTTP" = "200" ] && printf '%s' "$RESP" | grep -q session_id; then
  report "f mode=weak, weight=100 應成功" PASS "$(short)"
else
  report "f mode=weak, weight=100 應成功" FAIL "$(short)"
fi

# ---- g. teacher-say ----
call POST "$F/teacher-say" "$TOKEN" '{"context":"idle"}'
if [ "$HTTP" = "200" ] && printf '%s' "$RESP" | grep -q '"message"'; then
  report "g1 teacher-say 已登入應回 200 含 message" PASS "$(short)"
else
  report "g1 teacher-say 已登入應回 200 含 message" FAIL "$(short)"
fi
call POST "$F/teacher-say" "" '{"context":"idle"}'
if [ "$HTTP" = "401" ]; then
  report "g2 teacher-say 匿名應為 401" PASS "$(short)"
else
  report "g2 teacher-say 匿名應為 401" FAIL "$(short)"
fi

# ---- h. import-questions 驗證 ----
call POST "$F/import-questions" "$TOKEN" '{"questions":[{"id":"TEST-BAD"}]}'
if [ "$HTTP" = "422" ] && printf '%s' "$RESP" | grep -q "validation failed"; then
  report "h import-questions 壞資料應回 422" PASS "$(short)"
else
  report "h import-questions 壞資料應回 422" FAIL "$(short)"
fi

# ---- i. get_dashboard ----
call POST "$R/rpc/get_dashboard" "$TOKEN" '{}'
DASH="$(printf '%s' "$RESP" | python3 -I -c 'import json,sys
try: d=json.load(sys.stdin)
except Exception: print("parse-error"); raise SystemExit
if not isinstance(d,dict): print("non-object"); raise SystemExit
miss=[k for k in ("totals","dimensions","daily","streak") if k not in d]
print("missing:"+",".join(miss) if miss else "ok")')"
if [ "$HTTP" = "200" ] && [ "$DASH" = "ok" ]; then
  report "i get_dashboard 含 totals/dimensions/daily/streak" PASS "$(short)"
else
  report "i get_dashboard 含 totals/dimensions/daily/streak" FAIL "$DASH | $(short)"
fi

echo
echo "結果：PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
