// 老學究老師的對話框 — Supabase Edge Function
// 呼叫 MiniMax M2.7（OpenAI 相容端點）產生一句短評；沒有金鑰或呼叫失敗時退回內建語錄。
// 金鑰只存在 Edge Function secret（MINIMAX_API_KEY），前端永遠拿不到。
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const MINIMAX_API_KEY = Deno.env.get("MINIMAX_API_KEY") ?? "";
const MINIMAX_BASE_URL = (Deno.env.get("MINIMAX_BASE_URL") ?? "https://api.minimax.io/v1").replace(/\/$/, "");
const MINIMAX_MODEL = Deno.env.get("MINIMAX_MODEL") ?? "MiniMax-M2.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Mood = "happy" | "proud" | "neutral" | "worried" | "stern" | "sleepy";

interface Payload {
  context: "greeting" | "dashboard" | "result" | "wrong_review" | "idle";
  stats?: Record<string, unknown>;
  locale?: string;
}

// ---------- 內建語錄（fallback）----------
const QUOTES = [
  "學而不思則罔，思而不學則殆。——孔子",
  "天才是百分之一的靈感，加上百分之九十九的汗水。——愛迪生",
  "我沒有失敗，我只是找到了一萬種行不通的方法。——愛迪生",
  "不積跬步，無以至千里。——荀子",
  "知之者不如好之者，好之者不如樂之者。——孔子",
  "凡事豫則立，不豫則廢。——《禮記》",
  "Stay hungry, stay foolish. ——Steve Jobs",
  "The best way to predict the future is to invent it. ——Alan Kay",
  "學如逆水行舟，不進則退。",
  "今日事，今日畢。",
];

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

function fallbackMessage(p: Payload): { message: string; mood: Mood } {
  const s = (p.stats ?? {}) as Record<string, any>;
  const name = s.display_name ?? "同學";
  switch (p.context) {
    case "greeting":
      return { message: `${name}，歡迎回到書齋。今天也來把一題變成一分吧。`, mood: "happy" };
    case "result": {
      const score = Number(s.score ?? 0);
      if (score >= 90) return { message: `${score} 分！老夫教了三十年，這種卷子看一次笑一次。`, mood: "proud" };
      if (score >= 70) return { message: `${score} 分，及格了。但 iPAS 不是及格就結束，弱項還得補。`, mood: "happy" };
      if (score >= 50) return { message: `${score} 分，差一口氣。錯的題目去錯題本把每個選項讀一遍。`, mood: "worried" };
      return { message: `${score} 分……先別急著再考，把觀念讀熟比刷題重要。`, mood: "stern" };
    }
    case "wrong_review":
      return { message: "錯題不是恥辱，是地圖。把每個錯選項為什麼錯說得出口，才算會。", mood: "neutral" };
    case "dashboard": {
      const weakest = s.weakest_dimension_name;
      const streak = Number(s.streak ?? 0);
      if (!s.total_answered) return { message: `${name}，書齋裡還沒有你的筆跡。先來 10 題暖身如何？`, mood: "neutral" };
      if (weakest) return { message: `目前最弱的是「${weakest}」。老夫建議開「弱項加重」模式專攻它。${streak >= 3 ? `連續 ${streak} 天用功，不錯！` : ""}`, mood: streak >= 3 ? "proud" : "neutral" };
      return { message: pick(QUOTES), mood: "neutral" };
    }
    default:
      return { message: pick(QUOTES), mood: "sleepy" };
  }
}

// ---------- LLM ----------
function buildPrompt(p: Payload): { system: string; user: string } {
  const system = `你是「老學究老師」：一位 8-bit 像素風、留著白鬍子、戴圓眼鏡的老派教書先生，正在幫學生準備台灣經濟部 iPAS「AI應用規劃師」證照考試。
說話風格：繁體中文、簡短有力、帶一點老派幽默與嚴厲的關愛，偶爾引用一句名人名言（中外皆可，附上出處）。
限制：只輸出一句到兩句話，總長度不超過 60 個中文字；不要用條列、不要用 markdown、不要加引號包住整句、不要自我介紹。
最後一行另起一行輸出 mood 標記，格式為「MOOD: happy|proud|neutral|worried|stern|sleepy」。`;
  const user = `情境：${p.context}\n學生狀態（JSON）：${JSON.stringify(p.stats ?? {})}\n請依情境給出一句話：
- greeting：打招呼並鼓勵開始練習
- dashboard：點出目前最弱的能力面向與具體建議（例如開弱項加重模式），有連續天數就稱讚
- result：針對這次分數與錯最多的主題給評語
- wrong_review：鼓勵學生把錯題的每個選項弄懂
- idle：給一句振奮學習精神的名人名言`;
  return { system, user };
}

function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

async function callMiniMax(p: Payload): Promise<{ message: string; mood: Mood } | null> {
  if (!MINIMAX_API_KEY) return null;
  const { system, user } = buildPrompt(p);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(`${MINIMAX_BASE_URL}/chat/completions`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Authorization": `Bearer ${MINIMAX_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MINIMAX_MODEL,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        max_tokens: 400,
        temperature: 0.9,
      }),
    });
    if (!res.ok) {
      console.error("minimax error", res.status, await res.text());
      return null;
    }
    const data = await res.json();
    let content: string = data?.choices?.[0]?.message?.content ?? "";
    content = stripThinking(content);
    if (!content) return null;
    let mood: Mood = "neutral";
    const m = content.match(/MOOD:\s*(happy|proud|neutral|worried|stern|sleepy)/i);
    if (m) { mood = m[1].toLowerCase() as Mood; content = content.replace(m[0], "").trim(); }
    content = content.replace(/^["「『]+|["」』]+$/g, "").trim();
    if (content.length > 140) content = content.slice(0, 140) + "…";
    return { message: content, mood };
  } catch (e) {
    console.error("minimax exception", String(e));
    return null;
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  let payload: Payload;
  try { payload = await req.json(); } catch { payload = { context: "idle" }; }
  if (!payload.context) payload.context = "idle";

  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;

  let result = await callMiniMax(payload);
  let model = MINIMAX_MODEL;
  if (!result) { result = fallbackMessage(payload); model = "builtin"; }

  if (userId) {
    await supabase.from("teacher_messages").insert({
      user_id: userId, context: payload.context, message: result.message, mood: result.mood, model,
    });
  }

  return new Response(JSON.stringify({ ...result, model, llm_enabled: Boolean(MINIMAX_API_KEY) }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
