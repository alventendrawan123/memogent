-- Memogent agent — Supabase schema
-- Run this in Supabase SQL Editor (Dashboard → SQL → New query → paste → Run)
--
-- All bigint timestamps are unix milliseconds (Date.now() in TS).
-- chat_id is bigint because Telegram chat IDs exceed int32 range.

create table if not exists wallet_link (
    wallet_address text primary key,
    chat_id        bigint not null unique,
    linked_at      bigint not null,
    last_seen_at   bigint not null,
    constraint wallet_link_addr_format check (wallet_address ~ '^0x[a-fA-F0-9]{40}$')
);

create table if not exists link_token (
    token           text primary key,
    wallet_address  text not null,
    nonce           text not null,
    expires_at      bigint not null
);

create table if not exists checkin (
    id              bigserial primary key,
    wallet_address  text not null,
    sent_at         bigint not null,
    responded_at    bigint,
    response        text check (response in ('alive', 'busy') or response is null)
);

create table if not exists blocked_chat (
    chat_id     bigint primary key,
    blocked_at  bigint not null
);

create index if not exists idx_checkin_wallet on checkin(wallet_address);
create index if not exists idx_link_token_wallet on link_token(wallet_address);
create index if not exists idx_link_token_expires on link_token(expires_at);

-- Grants for service_role (agent server bypasses RLS, but still needs table privileges
-- when "Automatically expose new tables" is OFF at project creation).
grant all on table public.wallet_link to service_role;
grant all on table public.link_token to service_role;
grant all on table public.checkin to service_role;
grant all on table public.blocked_chat to service_role;
grant all on sequence public.checkin_id_seq to service_role;

-- RLS (Row-Level Security) — disabled by default since agent uses service_role.
-- Enable per-table when Bima's FE access is added in W3:
--   alter table wallet_link enable row level security;
--   create policy "wallet_link readable by owner" on wallet_link for select
--       using (auth.jwt() ->> 'wallet_address' = wallet_address);
