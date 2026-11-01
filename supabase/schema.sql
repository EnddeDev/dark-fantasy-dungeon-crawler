-- Схема СУМРАК для Postgres / Supabase: повторяет SQLite-схему сервера.
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  login text unique not null,
  pass text not null,
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  token text primary key,
  user_id uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  seen_at timestamptz not null default now()
);
create index if not exists sessions_user on sessions (user_id);

create table if not exists profiles (
  user_id uuid primary key references users (id) on delete cascade,
  name text not null,
  level int not null,
  best_floor int not null,
  gold int not null,
  save jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists friends (
  user_id uuid not null references users (id) on delete cascade,
  friend_id uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id)
);

create table if not exists trades (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references users (id) on delete cascade,
  to_id uuid not null references users (id) on delete cascade,
  status text not null check (status in ('offered', 'countered', 'accepted', 'declined', 'cancelled')),
  offer jsonb not null,
  request jsonb not null,
  message text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists market (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references users (id) on delete cascade,
  item jsonb not null,
  price int not null check (price > 0),
  status text not null check (status in ('active', 'sold', 'cancelled')),
  buyer_id uuid references users (id),
  created_at timestamptz not null default now(),
  sold_at timestamptz
);

create table if not exists duels (
  id uuid primary key default gen_random_uuid(),
  challenger uuid not null references users (id) on delete cascade,
  opponent uuid not null references users (id) on delete cascade,
  status text not null check (status in ('pending', 'active', 'finished', 'declined', 'cancelled')),
  state jsonb not null,
  winner uuid references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists messages (
  id bigserial primary key,
  channel text not null,
  from_id uuid not null references users (id) on delete cascade,
  body text not null check (char_length(body) <= 400),
  created_at timestamptz not null default now()
);
create index if not exists messages_channel on messages (channel, id);

-- Доступ к таблицам — только через Edge Function/сервисный ключ.
alter table users enable row level security;
alter table sessions enable row level security;
alter table profiles enable row level security;
alter table friends enable row level security;
alter table trades enable row level security;
alter table market enable row level security;
alter table duels enable row level security;
alter table messages enable row level security;

-- Атомарные операции (покупка, обмен, ход дуэли) оформить как security definer функции:
--   buy_listing(listing uuid) returns jsonb
--   accept_trade(trade uuid) returns jsonb
--   duel_action(duel uuid, side text, action jsonb) returns jsonb
