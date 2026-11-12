// 公開設定（anon key 本來就是給瀏覽器用的公開金鑰；資料安全由 RLS 控管）
export const SUPABASE_URL = "https://dcoeukgjxvqcwqsofwan.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjb2V1a2dqeHZxY3dxc29md2FuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ0MjEzNjAsImV4cCI6MjEwOTk5NzM2MH0.BdVpozvlT7aGlYVYKm6mkImCSSpbJ_ucVPBEyNmxdRM";
export const APP_NAME = "iPAS 書齋";
export const PASS_SCORE = 70;
// 官方：每科 50 題 / 75 分鐘（初級）→ 1.5 分鐘一題；中級每科 90 分鐘
export const MINUTES_PER_QUESTION = { L1: 1.5, L2: 1.8 };
