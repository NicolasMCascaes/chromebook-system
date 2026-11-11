alter table app.reservations add column teacher_name text;

update app.reservations r
set teacher_name = u.name
from app.users u
where u.id = r.user_id;

alter table app.reservations alter column teacher_name set not null;
alter table app.reservations add constraint reservations_teacher_name_not_blank check (length(btrim(teacher_name)) > 0);

alter table app.reservations alter column user_id drop not null;
alter table app.reservations add column cancel_token_hash text;

alter table app.reservations drop constraint reservations_idempotency_key;
alter table app.reservations add constraint reservations_idempotency_key unique (idempotency_key);

drop index app.reservations_user_date_idx;

call app.revoke_public_api_access();
