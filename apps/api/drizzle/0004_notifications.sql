alter table app.school_settings add column notification_emails text[] not null default '{}';

create table app.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  reservation_id uuid not null references app.reservations (id) on delete restrict,
  recipient text not null,
  payload jsonb not null,
  status text not null default 'PENDING',
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_outbox_type_valid check (type in ('RESERVATION_CREATED')),
  constraint notification_outbox_status_valid check (status in ('PENDING', 'SENT', 'FAILED')),
  constraint notification_outbox_attempts_valid check (attempts >= 0 and max_attempts > 0),
  constraint notification_outbox_sent_has_timestamp check (status <> 'SENT' or sent_at is not null)
);

create index notification_outbox_pending_idx on app.notification_outbox (next_attempt_at) where status = 'PENDING';
create index notification_outbox_reservation_idx on app.notification_outbox (reservation_id);

create trigger notification_outbox_set_updated_at before update on app.notification_outbox
  for each row execute function app.set_updated_at();

alter table app.notification_outbox enable row level security;

call app.revoke_public_api_access();
