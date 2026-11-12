alter table public.profiles add column if not exists is_admin boolean not null default false;

-- 管理員可直接讀寫題庫（給題庫管理頁用）
create policy "questions: admin read" on public.questions for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));
create policy "questions: admin write" on public.questions for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- 題庫統計（任何登入者可看各科目題數，用於考試設定頁）
create or replace view public.v_question_counts with (security_invoker = false) as
  select level, subject, topic, count(*)::int as n from public.questions where active group by level, subject, topic;
grant select on public.v_question_counts to authenticated;
