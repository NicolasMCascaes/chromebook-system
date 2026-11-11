create schema if not exists app;

create or replace function app.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table app.users (
  id uuid primary key,
  email text not null,
  name text not null,
  role text not null default 'PROFESSOR',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_email_normalized check (email = lower(btrim(email))),
  constraint users_email_format check (email ~ '^[^@[:space:]]+@[^@[:space:]]+$'),
  constraint users_name_not_blank check (length(btrim(name)) > 0),
  constraint users_role_valid check (role in ('PROFESSOR', 'ADMIN'))
);

create unique index users_email_key on app.users (email);

create table app.carts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  color text not null,
  display_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint carts_name_not_blank check (length(btrim(name)) > 0),
  constraint carts_color_hex check (color ~ '^#[0-9a-fA-F]{6}$'),
  constraint carts_display_order_non_negative check (display_order >= 0)
);

create unique index carts_name_key on app.carts (lower(name));

create table app.chromebooks (
  id uuid primary key default gen_random_uuid(),
  asset_tag text not null,
  name text not null,
  brand_model text not null,
  cart_id uuid not null references app.carts (id) on delete restrict,
  status text not null default 'AVAILABLE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chromebooks_asset_tag_not_blank check (length(btrim(asset_tag)) > 0),
  constraint chromebooks_name_not_blank check (length(btrim(name)) > 0),
  constraint chromebooks_brand_model_not_blank check (length(btrim(brand_model)) > 0),
  constraint chromebooks_status_valid check (status in ('AVAILABLE', 'MAINTENANCE', 'INACTIVE'))
);

create unique index chromebooks_asset_tag_key on app.chromebooks (upper(asset_tag));
create index chromebooks_cart_status_idx on app.chromebooks (cart_id, status);

create trigger users_set_updated_at before update on app.users
  for each row execute function app.set_updated_at();
create trigger carts_set_updated_at before update on app.carts
  for each row execute function app.set_updated_at();
create trigger chromebooks_set_updated_at before update on app.chromebooks
  for each row execute function app.set_updated_at();

alter table app.users enable row level security;
alter table app.carts enable row level security;
alter table app.chromebooks enable row level security;

revoke all on schema app from public;
revoke all on all tables in schema app from public;
revoke all on all functions in schema app from public;

do $$
declare
  api_role text;
begin
  foreach api_role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = api_role) then
      execute format('revoke all on schema app from %I', api_role);
      execute format('revoke all on all tables in schema app from %I', api_role);
      execute format('revoke all on all sequences in schema app from %I', api_role);
      execute format('revoke all on all functions in schema app from %I', api_role);
      execute format('alter default privileges in schema app revoke all on tables from %I', api_role);
      execute format('alter default privileges in schema app revoke all on sequences from %I', api_role);
      execute format('alter default privileges in schema app revoke all on functions from %I', api_role);
    end if;
  end loop;
end;
$$;
