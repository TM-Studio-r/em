-- TM Messenger schema
create extension if not exists pgcrypto;

create table if not exists public.profiles(
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  bio text not null default '' check (char_length(bio) <= 160),
  public_key text,
  created_at timestamptz not null default now()
);

create table if not exists public.conversations(
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('group','dm')),
  title text,
  created_at timestamptz not null default now()
);

create table if not exists public.conversation_members(
  chat_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key(chat_id,user_id)
);

create table if not exists public.messages(
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete set null,
  ciphertext text not null,
  message_type text not null default 'text' check(message_type in ('text','system')),
  created_at timestamptz not null default now()
);

create index if not exists messages_chat_created on public.messages(chat_id,created_at);
create index if not exists members_user on public.conversation_members(user_id);

insert into public.conversations(id,type,title)
values('00000000-0000-0000-0000-000000000001','group','گروه اصلی')
on conflict(id) do nothing;

alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

create policy "profiles readable to authenticated" on public.profiles for select to authenticated using (true);
create policy "own profile insert" on public.profiles for insert to authenticated with check (id=auth.uid());
create policy "own profile update" on public.profiles for update to authenticated using (id=auth.uid()) with check (id=auth.uid());

create policy "members can read conversations" on public.conversations for select to authenticated using (
  exists(select 1 from public.conversation_members m where m.chat_id=id and m.user_id=auth.uid())
);
create policy "members can read membership" on public.conversation_members for select to authenticated using (
  user_id=auth.uid() or exists(select 1 from public.conversation_members m where m.chat_id=conversation_members.chat_id and m.user_id=auth.uid())
);
create policy "self join" on public.conversation_members for insert to authenticated with check (user_id=auth.uid());
create policy "members read messages" on public.messages for select to authenticated using (
  exists(select 1 from public.conversation_members m where m.chat_id=messages.chat_id and m.user_id=auth.uid())
);
create policy "members send messages" on public.messages for insert to authenticated with check (
  sender_id=auth.uid() and exists(select 1 from public.conversation_members m where m.chat_id=messages.chat_id and m.user_id=auth.uid())
);

-- Realtime
alter publication supabase_realtime add table public.messages;
