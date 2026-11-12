// Supabase 存取層：所有與資料庫 / Edge Function 的互動集中在這裡
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

let _syllabus = null;
export async function loadSyllabus() {
  if (_syllabus) return _syllabus;
  const res = await fetch("./data/syllabus.json", { cache: "no-cache" });
  _syllabus = await res.json();
  return _syllabus;
}

// ---------- Auth ----------
export async function signUp({ email, password, display_name, avatar, target_level }) {
  const { data, error } = await sb.auth.signUp({
    email, password,
    options: { data: { display_name, avatar, target_level }, emailRedirectTo: location.origin + location.pathname },
  });
  if (error) throw error;
  return data;
}
export async function signIn(email, password) {
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}
export async function signOut() { await sb.auth.signOut(); }
export async function getSession() { return (await sb.auth.getSession()).data.session; }

export async function getProfile() {
  const { data, error } = await sb.from("profiles").select("*").single();
  if (error) throw error;
  return data;
}
export async function updateProfile(patch) {
  const uid = (await getSession())?.user?.id;
  const { error } = await sb.from("profiles").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", uid);
  if (error) throw error;
}

// ---------- 題庫 ----------
export async function questionCounts() {
  const { data, error } = await sb.from("v_question_counts").select("*");
  if (error) throw error;
  return data;
}
export async function fetchQuestions(ids) {
  const { data, error } = await sb.from("v_questions_public").select("*").in("id", ids);
  if (error) throw error;
  const map = Object.fromEntries(data.map(q => [q.id, q]));
  return ids.map(id => map[id]).filter(Boolean);
}

// ---------- 考試 ----------
export async function startExam({ level, subjects, count, mode, weakWeight }) {
  const { data, error } = await sb.rpc("start_exam", {
    p_level: level, p_subjects: subjects, p_count: count, p_mode: mode, p_weak_weight: weakWeight ?? 0,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return { sessionId: row.session_id, questionIds: row.question_ids };
}
export async function submitAnswer(sessionId, questionId, chosen, timeSpent) {
  const { data, error } = await sb.rpc("submit_answer", {
    p_session_id: sessionId, p_question_id: questionId, p_chosen: chosen, p_time_spent: Math.round(timeSpent || 0),
  });
  if (error) throw error;
  return data;
}
export async function finishExam(sessionId) {
  const { data, error } = await sb.rpc("finish_exam", { p_session_id: sessionId });
  if (error) throw error;
  return data;
}
export async function sessionReview(sessionId) {
  const { data, error } = await sb.rpc("get_session_review", { p_session_id: sessionId });
  if (error) throw error;
  return data;
}
export async function questionReview(questionId) {
  const { data, error } = await sb.rpc("get_question_review", { p_question_id: questionId });
  if (error) throw error;
  return data;
}
export async function wrongBook(level) {
  let q = sb.from("v_wrong_book").select("*").order("last_answered_at", { ascending: false });
  if (level) q = q.eq("level", level);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}
export async function dashboard(level) {
  const { data, error } = await sb.rpc("get_dashboard", { p_level: level ?? null });
  if (error) throw error;
  return data;
}
export async function listSessions(limit = 30) {
  const { data, error } = await sb.from("exam_sessions").select("*").order("started_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return data;
}

// ---------- 老師 ----------
export async function teacherSay(context, stats) {
  const { data, error } = await sb.functions.invoke("teacher-say", { body: { context, stats } });
  if (error) throw error;
  return data;
}
export async function importQuestions(questions) {
  const { data, error } = await sb.functions.invoke("import-questions", { body: { questions } });
  if (error) {
    // 取回函式回傳的錯誤內容
    try { const body = await error.context?.json?.(); if (body) return body; } catch {}
    throw error;
  }
  return data;
}
