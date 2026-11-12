-- ============================================================
-- 【草稿・尚未套用】付費方案：考券 + 期間方案
-- 說明見 docs/MONETIZATION.md。套用前請先確認金流商與發票流程。
-- ============================================================

create table if not exists public.products (
  code        text primary key,                 -- single / pack5 / sprint
  name        text not null,
  price_twd   int  not null check (price_twd >= 0),
  credits     int  not null default 0,          -- 發放考券數
  pass_days   int  not null default 0,          -- 期間方案天數（0 = 非期間方案）
  active      boolean not null default true
);
insert into public.products (code, name, price_twd, credits, pass_days) values
  ('single', '單次模擬考', 30, 1, 0),
  ('pack5',  '五回合',     50, 5, 0),
  ('sprint', '考前衝刺班', 100, 0, 14)
on conflict (code) do nothing;

create table if not exists public.billing_rules (
  key   text primary key,
  value jsonb not null
);
insert into public.billing_rules (key, value) values
  ('free_credits_on_signup', '1'),
  ('min_questions_to_charge', '1'),
  ('billing_enabled', 'false')
on conflict (key) do nothing;

create table if not exists public.orders (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  product_code  text not null references public.products(code),
  amount_twd    int  not null,
  status        text not null default 'pending' check (status in ('pending','paid','failed','refunded')),
  provider      text,                           -- ecpay / newebpay / linepay / stripe / manual
  provider_ref  text unique,                    -- 金流商交易編號（冪等鍵）
  created_at    timestamptz not null default now(),
  paid_at       timestamptz
);
alter table public.orders enable row level security;
create policy "orders: own" on public.orders for select using (auth.uid() = user_id);

create table if not exists public.credits_ledger (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  delta       int  not null,
  reason      text not null check (reason in ('signup','purchase','consume','grant','refund')),
  order_id    uuid references public.orders(id),
  session_id  uuid references public.exam_sessions(id),
  created_at  timestamptz not null default now(),
  unique (session_id)                           -- 同一場考試只扣一次
);
alter table public.credits_ledger enable row level security;
create policy "ledger: own" on public.credits_ledger for select using (auth.uid() = user_id);

create table if not exists public.passes (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  product_code text not null references public.products(code),
  order_id    uuid references public.orders(id),
  starts_at   timestamptz not null default now(),
  expires_at  timestamptz not null
);
alter table public.passes enable row level security;
create policy "passes: own" on public.passes for select using (auth.uid() = user_id);

create or replace view public.v_user_balance with (security_invoker = true) as
  select u.id as user_id,
         coalesce((select sum(delta) from public.credits_ledger l where l.user_id = u.id), 0)::int as credits,
         (select max(expires_at) from public.passes p where p.user_id = u.id and p.expires_at > now()) as pass_until
  from auth.users u;

-- 權益查詢
create or replace function public.get_entitlement()
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'billing_enabled', (select (value)::boolean from public.billing_rules where key = 'billing_enabled'),
    'credits', coalesce((select sum(delta) from public.credits_ledger where user_id = auth.uid()), 0),
    'pass_until', (select max(expires_at) from public.passes where user_id = auth.uid() and expires_at > now())
  );
$$;

-- 開考前扣點：有 pass 放行；否則扣 1 張考券；都沒有則 raise 'PAYMENT_REQUIRED'
create or replace function public.consume_credit_or_pass(p_session_id uuid, p_question_count int)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_enabled boolean := (select (value)::boolean from public.billing_rules where key = 'billing_enabled');
  v_min int := (select (value)::int from public.billing_rules where key = 'min_questions_to_charge');
  v_balance int;
begin
  if not coalesce(v_enabled, false) then return; end if;
  if p_question_count < coalesce(v_min, 1) then return; end if;
  if exists (select 1 from public.passes where user_id = v_uid and expires_at > now()) then return; end if;
  select coalesce(sum(delta),0) into v_balance from public.credits_ledger where user_id = v_uid;
  if v_balance <= 0 then raise exception 'PAYMENT_REQUIRED'; end if;
  insert into public.credits_ledger (user_id, delta, reason, session_id) values (v_uid, -1, 'consume', p_session_id);
end $$;

-- 金流 webhook 套用付款（冪等）：由 Edge Function 以 service role 呼叫
create or replace function public.apply_payment(p_order_id uuid, p_provider text, p_provider_ref text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_o public.orders%rowtype; v_p public.products%rowtype;
begin
  select * into v_o from public.orders where id = p_order_id for update;
  if v_o.id is null then raise exception 'order not found'; end if;
  if v_o.status = 'paid' then return jsonb_build_object('ok', true, 'already', true); end if;
  update public.orders set status = 'paid', provider = p_provider, provider_ref = p_provider_ref, paid_at = now() where id = p_order_id;
  select * into v_p from public.products where code = v_o.product_code;
  if v_p.credits > 0 then
    insert into public.credits_ledger (user_id, delta, reason, order_id) values (v_o.user_id, v_p.credits, 'purchase', p_order_id);
  end if;
  if v_p.pass_days > 0 then
    insert into public.passes (user_id, product_code, order_id, expires_at)
    values (v_o.user_id, v_p.code, p_order_id, now() + make_interval(days => v_p.pass_days));
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- 註冊送考券：在 handle_new_user() 內加入
--   insert into public.credits_ledger (user_id, delta, reason) values (new.id, <free_credits_on_signup>, 'signup');
-- 開考扣點：在 start_exam() 取得 v_sid 後加入
--   perform public.consume_credit_or_pass(v_sid, array_length(v_ids,1));

grant execute on function public.get_entitlement() to authenticated;
revoke execute on function public.apply_payment(uuid,text,text) from anon, authenticated;
