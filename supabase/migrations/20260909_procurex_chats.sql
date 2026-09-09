-- Shared recent chats for the same signed-in user on every device.
create table if not exists public.procurex_chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'New chat',
  legacy_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.procurex_chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.procurex_chat_sessions (id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists procurex_chat_sessions_user_updated_idx
  on public.procurex_chat_sessions (user_id, updated_at desc);

create index if not exists procurex_chat_messages_session_created_idx
  on public.procurex_chat_messages (session_id, created_at);

alter table public.procurex_chat_sessions enable row level security;
alter table public.procurex_chat_messages enable row level security;

drop policy if exists "procurex_chat_sessions_own" on public.procurex_chat_sessions;
create policy "procurex_chat_sessions_own"
  on public.procurex_chat_sessions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "procurex_chat_messages_own" on public.procurex_chat_messages;
create policy "procurex_chat_messages_own"
  on public.procurex_chat_messages
  for all
  using (
    exists (
      select 1
      from public.procurex_chat_sessions s
      where s.id = session_id and s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.procurex_chat_sessions s
      where s.id = session_id and s.user_id = auth.uid()
    )
  );

grant select, insert, update, delete on public.procurex_chat_sessions to authenticated;
grant select, insert, update, delete on public.procurex_chat_messages to authenticated;

alter table public.procurex_chat_sessions replica identity full;
alter table public.procurex_chat_messages replica identity full;

do $$
begin
  begin
    alter publication supabase_realtime add table public.procurex_chat_sessions;
  exception
    when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.procurex_chat_messages;
  exception
    when duplicate_object then null;
  end;
end $$;
