-- ============================================================
-- iPAS AI應用規劃師 考試模擬系統  — 初始化 schema
-- ============================================================
create extension if not exists pgcrypto;

-- ---------- profiles ----------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null default '考生',
  avatar        text not null default 'cat',          -- 像素頭像代號
  target_level  text not null default 'L1' check (target_level in ('L1','L2')),
  exam_date     date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "profiles: read own"   on public.profiles for select using (auth.uid() = id);
create policy "profiles: update own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "profiles: insert own" on public.profiles for insert with check (auth.uid() = id);

-- 註冊時自動建立 profile（display_name 來自 sign-up metadata）
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, avatar, target_level)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'display_name',''), split_part(coalesce(new.email,'考生'),'@',1)),
    coalesce(nullif(new.raw_user_meta_data->>'avatar',''), 'cat'),
    coalesce(nullif(new.raw_user_meta_data->>'target_level',''), 'L1')
  )
  on conflict (id) do nothing;
  return new;
end $$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- questions（答案欄位不直接開放給前端）----------
create table if not exists public.questions (
  id              text primary key,
  level           text not null check (level in ('L1','L2')),
  subject         text not null,
  topic           text not null,
  indicator       text not null,
  dimension       text not null,
  difficulty      smallint not null default 2 check (difficulty between 1 and 3),
  question        text not null,
  options         jsonb not null,            -- {"A":"..","B":"..","C":"..","D":".."}
  answer          text not null check (answer in ('A','B','C','D')),
  explanation     text not null,
  option_analysis jsonb not null,            -- {"A":"..",...}
  keywords        text[] not null default '{}',
  source_hint     text,
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);
create index if not exists questions_level_subject_idx on public.questions(level, subject, topic) where active;
alter table public.questions enable row level security;
-- 沒有任何 select policy：前端只能透過 view / RPC 取得題目

-- 公開題目 view（不含答案與解析）
create or replace view public.v_questions_public
with (security_invoker = false) as
  select id, level, subject, topic, indicator, dimension, difficulty, question, options, keywords
  from public.questions where active;
grant select on public.v_questions_public to authenticated;

-- ---------- exam_sessions ----------
create table if not exists public.exam_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  level         text not null check (level in ('L1','L2')),
  subjects      text[] not null,
  mode          text not null check (mode in ('random','weak','wrong_only')),
  weak_weight   smallint not null default 0 check (weak_weight between 0 and 100),
  question_ids  text[] not null,
  total         int not null,
  correct       int not null default 0,
  status        text not null default 'in_progress' check (status in ('in_progress','finished','abandoned')),
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  duration_sec  int not null default 0
);
create index if not exists exam_sessions_user_idx on public.exam_sessions(user_id, started_at desc);
alter table public.exam_sessions enable row level security;
create policy "sessions: own" on public.exam_sessions for select using (auth.uid() = user_id);

-- ---------- answers ----------
create table if not exists public.answers (
  id              bigserial primary key,
  session_id      uuid not null references public.exam_sessions(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  question_id     text not null references public.questions(id),
  chosen          text check (chosen in ('A','B','C','D')),
  is_correct      boolean not null default false,
  time_spent_sec  int not null default 0,
  answered_at     timestamptz not null default now(),
  unique (session_id, question_id)
);
create index if not exists answers_user_idx on public.answers(user_id, answered_at desc);
create index if not exists answers_user_q_idx on public.answers(user_id, question_id);
alter table public.answers enable row level security;
create policy "answers: own" on public.answers for select using (auth.uid() = user_id);

-- ---------- teacher_messages（老學究老師的話語紀錄）----------
create table if not exists public.teacher_messages (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  context     text not null,          -- dashboard / result / greeting
  message     text not null,
  mood        text not null default 'neutral',
  model       text,
  created_at  timestamptz not null default now()
);
alter table public.teacher_messages enable row level security;
create policy "teacher: own" on public.teacher_messages for select using (auth.uid() = user_id);
create policy "teacher: insert own" on public.teacher_messages for insert with check (auth.uid() = user_id);

-- ============================================================
-- 統計 views（security_invoker：套用呼叫者的 RLS）
-- ============================================================
create or replace view public.v_user_dimension_stats
with (security_invoker = true) as
  select a.user_id, q.level, q.dimension,
         count(*)::int                         as attempted,
         sum((a.is_correct)::int)::int         as correct,
         round(100.0 * sum((a.is_correct)::int) / nullif(count(*),0), 1) as accuracy
  from public.answers a join public.questions q on q.id = a.question_id
  where a.chosen is not null
  group by a.user_id, q.level, q.dimension;

create or replace view public.v_user_topic_stats
with (security_invoker = true) as
  select a.user_id, q.level, q.subject, q.topic,
         count(*)::int                         as attempted,
         sum((a.is_correct)::int)::int         as correct,
         round(100.0 * sum((a.is_correct)::int) / nullif(count(*),0), 1) as accuracy
  from public.answers a join public.questions q on q.id = a.question_id
  where a.chosen is not null
  group by a.user_id, q.level, q.subject, q.topic;

create or replace view public.v_user_daily
with (security_invoker = true) as
  select user_id,
         (answered_at at time zone 'Asia/Taipei')::date as day,
         count(*)::int                 as answered,
         sum((is_correct)::int)::int   as correct,
         sum(time_spent_sec)::int      as seconds
  from public.answers
  where chosen is not null
  group by user_id, (answered_at at time zone 'Asia/Taipei')::date;

create or replace view public.v_user_totals
with (security_invoker = true) as
  select s.user_id,
         count(*) filter (where s.status = 'finished')::int as sessions,
         coalesce(sum(s.duration_sec),0)::int                 as total_seconds,
         (select count(*) from public.answers a where a.user_id = s.user_id and a.chosen is not null)::int as total_answered,
         (select count(*) from public.answers a where a.user_id = s.user_id and a.is_correct)::int          as total_correct
  from public.exam_sessions s
  group by s.user_id;

grant select on public.v_user_dimension_stats, public.v_user_topic_stats, public.v_user_daily, public.v_user_totals to authenticated;

-- 最新一次答錯且尚未答對的題目（錯題本）
create or replace view public.v_wrong_book
with (security_invoker = true) as
  with last_ans as (
    select distinct on (user_id, question_id) user_id, question_id, is_correct, chosen, answered_at
    from public.answers where chosen is not null
    order by user_id, question_id, answered_at desc
  ),
  wrong_count as (
    select user_id, question_id, count(*) filter (where not is_correct)::int as times_wrong, count(*)::int as times_seen
    from public.answers where chosen is not null group by user_id, question_id
  )
  select l.user_id, l.question_id, l.chosen as last_chosen, l.answered_at as last_answered_at,
         w.times_wrong, w.times_seen,
         q.level, q.subject, q.topic, q.indicator, q.dimension, q.difficulty, q.question, q.options, q.keywords
  from last_ans l join wrong_count w using (user_id, question_id)
  join public.questions q on q.id = l.question_id
  where l.is_correct = false;
grant select on public.v_wrong_book to authenticated;

-- 給 security definer 函式用的錯題本（不受 RLS 影響，函式內已限制 user_id）
create or replace view public.v_wrong_book_sd with (security_invoker = false) as
  with last_ans as (
    select distinct on (user_id, question_id) user_id, question_id, is_correct
    from public.answers where chosen is not null
    order by user_id, question_id, answered_at desc
  )
  select l.user_id, l.question_id, q.level, q.subject
  from last_ans l join public.questions q on q.id = l.question_id
  where l.is_correct = false;
revoke all on public.v_wrong_book_sd from anon, authenticated;

-- ============================================================
-- RPC：開始考試（抽題邏輯在資料庫端）
--   mode = random      : 純亂數
--   mode = weak        : 依 weak_weight(0~100) 加重「答錯率高的主題」與「曾答錯的題目」
--   mode = wrong_only  : 只從錯題本抽
-- ============================================================
create or replace function public.start_exam(
  p_level text, p_subjects text[], p_count int, p_mode text default 'random', p_weak_weight int default 0
) returns table (session_id uuid, question_ids text[])
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_ids text[];
  v_sid uuid;
  v_w numeric := greatest(0, least(100, coalesce(p_weak_weight,0))) / 100.0;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if p_count < 1 or p_count > 100 then raise exception 'count must be 1..100'; end if;

  if p_mode = 'wrong_only' then
    select array_agg(id) into v_ids from (
      select wb.question_id as id
      from public.v_wrong_book_sd wb
      where wb.user_id = v_uid and wb.level = p_level and wb.subject = any(p_subjects)
      order by random() limit p_count
    ) t;
  else
    -- 使用 Efraimidis–Spirakis 加權抽樣：key = random()^(1/weight)
    with topic_err as (
      select q.topic,
             1.0 - (sum((a.is_correct)::int)::numeric / nullif(count(*),0)) as err_rate
      from public.answers a join public.questions q on q.id = a.question_id
      where a.user_id = v_uid and a.chosen is not null and q.level = p_level
      group by q.topic
    ),
    q_wrong as (
      select distinct on (a.question_id) a.question_id, (not a.is_correct) as last_wrong
      from public.answers a where a.user_id = v_uid and a.chosen is not null
      order by a.question_id, a.answered_at desc
    ),
    cand as (
      select q.id,
             case when p_mode = 'weak'
                  then 1.0 + v_w * (3.0 * coalesce(te.err_rate,0) + 2.0 * (coalesce(qw.last_wrong,false))::int)
                  else 1.0 end as w
      from public.questions q
      left join topic_err te on te.topic = q.topic
      left join q_wrong qw on qw.question_id = q.id
      where q.active and q.level = p_level and q.subject = any(p_subjects)
    )
    select array_agg(id) into v_ids from (
      select id from cand order by power(random(), 1.0 / w) desc limit p_count
    ) t;
  end if;

  if v_ids is null or array_length(v_ids,1) is null then
    raise exception 'no questions available for this selection';
  end if;

  insert into public.exam_sessions (user_id, level, subjects, mode, weak_weight, question_ids, total)
  values (v_uid, p_level, p_subjects, p_mode, coalesce(p_weak_weight,0), v_ids, array_length(v_ids,1))
  returning id into v_sid;

  return query select v_sid, v_ids;
end $$;


-- ============================================================
-- RPC：作答並批改（回傳正解與逐選項解析）
-- ============================================================
create or replace function public.submit_answer(
  p_session_id uuid, p_question_id text, p_chosen text, p_time_spent int default 0
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_q public.questions%rowtype;
  v_correct boolean;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.exam_sessions s
                 where s.id = p_session_id and s.user_id = v_uid and s.status = 'in_progress'
                   and p_question_id = any(s.question_ids)) then
    raise exception 'invalid session or question';
  end if;
  select * into v_q from public.questions where id = p_question_id;
  v_correct := (p_chosen = v_q.answer);

  insert into public.answers (session_id, user_id, question_id, chosen, is_correct, time_spent_sec)
  values (p_session_id, v_uid, p_question_id, p_chosen, v_correct, greatest(0, coalesce(p_time_spent,0)))
  on conflict (session_id, question_id) do update
    set chosen = excluded.chosen, is_correct = excluded.is_correct,
        time_spent_sec = excluded.time_spent_sec, answered_at = now();

  return jsonb_build_object(
    'is_correct', v_correct,
    'answer', v_q.answer,
    'explanation', v_q.explanation,
    'option_analysis', v_q.option_analysis,
    'source_hint', v_q.source_hint
  );
end $$;

-- ============================================================
-- RPC：結束考試（統計、計時）
-- ============================================================
create or replace function public.finish_exam(p_session_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_s public.exam_sessions%rowtype;
  v_correct int; v_answered int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_s from public.exam_sessions where id = p_session_id and user_id = v_uid;
  if v_s.id is null then raise exception 'session not found'; end if;

  select count(*) filter (where is_correct), count(*) filter (where chosen is not null)
    into v_correct, v_answered
  from public.answers where session_id = p_session_id;

  update public.exam_sessions
     set status = 'finished', correct = v_correct, finished_at = now(),
         duration_sec = greatest(0, extract(epoch from (now() - started_at))::int)
   where id = p_session_id;

  return jsonb_build_object(
    'session_id', p_session_id, 'total', v_s.total, 'answered', v_answered,
    'correct', v_correct, 'score', round(100.0 * v_correct / nullif(v_s.total,0), 1),
    'passed', (100.0 * v_correct / nullif(v_s.total,0)) >= 70
  );
end $$;

-- ============================================================
-- RPC：取得單題完整解析（僅限自己作答過的題目）→ 錯題學習頁
-- ============================================================
create or replace function public.get_question_review(p_question_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_q public.questions%rowtype;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.answers where user_id = v_uid and question_id = p_question_id) then
    raise exception 'question not answered yet';
  end if;
  select * into v_q from public.questions where id = p_question_id;
  return to_jsonb(v_q);
end $$;

-- ============================================================
-- RPC：session 回顧（題目 + 使用者作答 + 正解）
-- ============================================================
create or replace function public.get_session_review(p_session_id uuid)
returns jsonb language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'question_id', q.id, 'topic', q.topic, 'indicator', q.indicator, 'dimension', q.dimension,
      'difficulty', q.difficulty, 'question', q.question, 'options', q.options,
      'answer', q.answer, 'explanation', q.explanation, 'option_analysis', q.option_analysis,
      'source_hint', q.source_hint, 'keywords', q.keywords,
      'chosen', a.chosen, 'is_correct', coalesce(a.is_correct,false), 'time_spent_sec', coalesce(a.time_spent_sec,0),
      'ord', ord.n
    ) order by ord.n), '[]'::jsonb)
  from public.exam_sessions s
  cross join lateral unnest(s.question_ids) with ordinality as ord(qid, n)
  join public.questions q on q.id = ord.qid
  left join public.answers a on a.session_id = s.id and a.question_id = q.id
  where s.id = p_session_id and s.user_id = auth.uid();
$$;

-- ============================================================
-- RPC：Dashboard 一次取回（五力圖、總計、日曆、最近 sessions、錯題數）
-- ============================================================
create or replace function public.get_dashboard(p_level text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_level text;
  v_out jsonb;
  v_today date := (now() at time zone 'Asia/Taipei')::date;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select coalesce(p_level, target_level, 'L1') into v_level from public.profiles where id = v_uid;
  v_level := coalesce(v_level, p_level, 'L1');

  select jsonb_build_object(
    'level', v_level,
    'profile', (select to_jsonb(p) from public.profiles p where p.id = v_uid),
    'totals', (select coalesce(to_jsonb(t), jsonb_build_object('sessions',0,'total_seconds',0,'total_answered',0,'total_correct',0))
               from (select sessions, total_seconds, total_answered, total_correct from public.v_user_totals where user_id = v_uid) t),
    'dimensions', (select coalesce(jsonb_agg(jsonb_build_object('dimension',dimension,'attempted',attempted,'correct',correct,'accuracy',accuracy)), '[]'::jsonb)
                   from public.v_user_dimension_stats where user_id = v_uid and level = v_level),
    'topics', (select coalesce(jsonb_agg(jsonb_build_object('subject',subject,'topic',topic,'attempted',attempted,'correct',correct,'accuracy',accuracy)), '[]'::jsonb)
               from public.v_user_topic_stats where user_id = v_uid and level = v_level),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('day',day,'answered',answered,'correct',correct,'seconds',seconds) order by day), '[]'::jsonb)
              from public.v_user_daily where user_id = v_uid and day >= (v_today - 120)),
    'recent_sessions', (select coalesce(jsonb_agg(jsonb_build_object('id',id,'level',level,'subjects',subjects,'mode',mode,'total',total,'correct',correct,
                          'status',status,'started_at',started_at,'duration_sec',duration_sec) order by started_at desc), '[]'::jsonb)
                        from (select * from public.exam_sessions where user_id = v_uid order by started_at desc limit 10) s),
    'wrong_count', (select count(*) from public.v_wrong_book_sd where user_id = v_uid and level = v_level),
    'streak', (
      with d as (select distinct day from public.v_user_daily where user_id = v_uid),
      s as (select day, day - (row_number() over (order by day))::int as grp from d)
      select coalesce((select count(*) from s where grp = (select grp from s where day in (v_today, v_today - 1) order by day desc limit 1)),0)
    )
  ) into v_out;
  return v_out;
end $$;

grant execute on function public.start_exam(text,text[],int,text,int) to authenticated;
grant execute on function public.submit_answer(uuid,text,text,int) to authenticated;
grant execute on function public.finish_exam(uuid) to authenticated;
grant execute on function public.get_question_review(text) to authenticated;
grant execute on function public.get_session_review(uuid) to authenticated;
grant execute on function public.get_dashboard(text) to authenticated;
revoke execute on function public.start_exam(text,text[],int,text,int) from anon;
revoke execute on function public.submit_answer(uuid,text,text,int) from anon;
revoke execute on function public.finish_exam(uuid) from anon;
revoke execute on function public.get_question_review(text) from anon;
revoke execute on function public.get_session_review(uuid) from anon;
revoke execute on function public.get_dashboard(text) from anon;
