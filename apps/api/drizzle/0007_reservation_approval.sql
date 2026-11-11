alter table app.reservations drop constraint reservations_status_valid;
alter table app.reservations add constraint reservations_status_valid
  check (status in ('PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED'));
alter table app.reservations alter column status set default 'PENDING';

alter table app.reservations add column decided_at timestamptz;
alter table app.reservations add column decided_by uuid references app.users (id) on delete restrict;
alter table app.reservations add column decision_reason text;
alter table app.reservations add column approval_token_hash text;

alter table app.reservations add constraint reservations_rejection_decided
  check (status <> 'REJECTED' or decided_at is not null);

alter table app.reservations drop constraint reservations_no_overlap;
alter table app.reservations add constraint reservations_no_overlap
  exclude using gist (cart_id with =, period with &&) where (status in ('PENDING', 'CONFIRMED'));

create index reservations_pending_idx on app.reservations (reservation_date) where status = 'PENDING';

alter table app.notification_outbox drop constraint notification_outbox_type_valid;
alter table app.notification_outbox add constraint notification_outbox_type_valid
  check (type in ('RESERVATION_CREATED', 'RESERVATION_REQUESTED'));

call app.revoke_public_api_access();
