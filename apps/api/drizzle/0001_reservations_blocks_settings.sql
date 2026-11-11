create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;

create or replace procedure app.revoke_public_api_access()
language plpgsql
set search_path = ''
as $$
declare
  api_role text;
begin
  execute 'revoke all on all tables in schema app from public';
  execute 'revoke all on all functions in schema app from public';
  execute 'revoke all on all procedures in schema app from public';
  foreach api_role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_catalog.pg_roles where rolname = api_role) then
      execute format('revoke all on schema app from %I', api_role);
      execute format('revoke all on all tables in schema app from %I', api_role);
      execute format('revoke all on all sequences in schema app from %I', api_role);
      execute format('revoke all on all functions in schema app from %I', api_role);
      execute format('revoke all on all procedures in schema app from %I', api_role);
    end if;
  end loop;
end;
$$;

create table app.school_settings (
  id smallint primary key default 1,
  opening_time time not null,
  closing_time time not null,
  slot_minutes smallint not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint school_settings_single_row check (id = 1),
  constraint school_settings_hours_order check (closing_time > opening_time),
  constraint school_settings_slot_valid check (slot_minutes in (5, 10, 15, 20, 30, 60))
);

insert into app.school_settings (id, opening_time, closing_time, slot_minutes)
values (1, '07:00', '18:00', 5);

create table app.calendar_blocks (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  start_date date not null,
  end_date date not null,
  reason text not null,
  cart_id uuid references app.carts (id) on delete restrict,
  created_by uuid references app.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_blocks_kind_valid check (
    kind in ('BLOCK', 'HOLIDAY_NATIONAL', 'HOLIDAY_STATE', 'HOLIDAY_MUNICIPAL', 'SCHOOL_RECESS')
  ),
  constraint calendar_blocks_dates_order check (end_date >= start_date),
  constraint calendar_blocks_reason_not_blank check (length(btrim(reason)) > 0),
  constraint calendar_blocks_holiday_applies_to_all_carts check (kind = 'BLOCK' or cart_id is null)
);

create index calendar_blocks_period_idx on app.calendar_blocks using gist (daterange(start_date, end_date, '[]'));
create index calendar_blocks_cart_idx on app.calendar_blocks (cart_id);

create table app.reservations (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references app.carts (id) on delete restrict,
  user_id uuid not null references app.users (id) on delete restrict,
  class_name text not null,
  reservation_date date not null,
  start_time time not null,
  end_time time not null,
  period tsrange generated always as (
    case when end_time > start_time
      then tsrange(reservation_date + start_time, reservation_date + end_time, '[)')
    end
  ) stored,
  status text not null default 'CONFIRMED',
  notes text,
  idempotency_key uuid not null,
  request_hash text not null,
  cancelled_at timestamptz,
  cancelled_by uuid references app.users (id) on delete restrict,
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reservations_time_order check (end_time > start_time),
  constraint reservations_status_valid check (status in ('CONFIRMED', 'CANCELLED')),
  constraint reservations_cancellation_consistent check ((status = 'CANCELLED') = (cancelled_at is not null)),
  constraint reservations_class_name_not_blank check (length(btrim(class_name)) > 0),
  constraint reservations_idempotency_key unique (user_id, idempotency_key),
  constraint reservations_no_overlap exclude using gist (cart_id with =, period with &&)
    where (status = 'CONFIRMED')
);

create index reservations_date_idx on app.reservations (reservation_date);
create index reservations_user_date_idx on app.reservations (user_id, reservation_date);

create trigger school_settings_set_updated_at before update on app.school_settings
  for each row execute function app.set_updated_at();
create trigger calendar_blocks_set_updated_at before update on app.calendar_blocks
  for each row execute function app.set_updated_at();
create trigger reservations_set_updated_at before update on app.reservations
  for each row execute function app.set_updated_at();

alter table app.school_settings enable row level security;
alter table app.calendar_blocks enable row level security;
alter table app.reservations enable row level security;

call app.revoke_public_api_access();
