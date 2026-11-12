// 題庫匯入 — 只有 profiles.is_admin = true 的使用者可以呼叫
// POST body: { questions: [...] }  （格式見 data/QUESTION_SCHEMA.md）
// 或 { url: "https://raw.githubusercontent.com/.../L11-part1.json" } 由伺服器端抓取後匯入
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const REQUIRED = ["id", "level", "subject", "topic", "indicator", "dimension", "difficulty", "question", "options", "answer", "explanation", "option_analysis"];

function validate(q: Record<string, unknown>): string | null {
  for (const k of REQUIRED) if (q[k] === undefined || q[k] === null || q[k] === "") return `缺少欄位 ${k}`;
  if (!["L1", "L2"].includes(String(q.level))) return "level 必須是 L1 或 L2";
  if (!["A", "B", "C", "D"].includes(String(q.answer))) return "answer 必須是 A/B/C/D";
  const opts = q.options as Record<string, string>;
  const oa = q.option_analysis as Record<string, string>;
  for (const k of ["A", "B", "C", "D"]) {
    if (!opts?.[k]) return `options 缺少 ${k}`;
    if (!oa?.[k]) return `option_analysis 缺少 ${k}`;
  }
  const d = Number(q.difficulty);
  if (!(d >= 1 && d <= 3)) return "difficulty 必須是 1~3";
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: uerr } = await userClient.auth.getUser();
  if (uerr || !userData?.user) return json({ error: "unauthorized" }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: prof } = await admin.from("profiles").select("is_admin").eq("id", userData.user.id).single();
  if (!prof?.is_admin) return json({ error: "forbidden: admin only" }, 403);

  let body: { questions?: Record<string, unknown>[]; url?: string; deactivate_missing?: boolean };
  try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }

  let questions = body.questions ?? [];
  if (body.url) {
    if (!/^https:\/\/(raw\.githubusercontent\.com|github\.com)\//.test(body.url)) return json({ error: "url 僅允許 GitHub" }, 400);
    const r = await fetch(body.url);
    if (!r.ok) return json({ error: `fetch failed ${r.status}` }, 400);
    questions = await r.json();
  }
  if (!Array.isArray(questions) || questions.length === 0) return json({ error: "沒有題目" }, 400);
  if (questions.length > 500) return json({ error: "一次最多 500 題" }, 400);

  const errors: string[] = [];
  const rows = [];
  for (const q of questions) {
    const e = validate(q);
    if (e) { errors.push(`${q.id ?? "?"}: ${e}`); continue; }
    rows.push({
      id: q.id, level: q.level, subject: q.subject, topic: q.topic, indicator: q.indicator, dimension: q.dimension,
      difficulty: Number(q.difficulty), question: q.question, options: q.options, answer: q.answer,
      explanation: q.explanation, option_analysis: q.option_analysis,
      keywords: Array.isArray(q.keywords) ? q.keywords : [], source_hint: q.source_hint ?? null, active: true,
    });
  }
  if (errors.length) return json({ error: "validation failed", details: errors }, 422);

  const { error } = await admin.from("questions").upsert(rows, { onConflict: "id" });
  if (error) return json({ error: error.message }, 500);

  return json({ ok: true, imported: rows.length });
});
