create table app.class_schedules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  display_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint class_schedules_name_not_blank check (length(btrim(name)) > 0),
  constraint class_schedules_name_key unique (name)
);

create trigger class_schedules_set_updated_at before update on app.class_schedules
  for each row execute function app.set_updated_at();

alter table app.class_schedules enable row level security;

insert into app.class_schedules (name, display_order) values
  ('6º A, 6º B e 7º ano', 1),
  ('Demais turmas', 2);

alter table app.class_periods add column schedule_id uuid references app.class_schedules (id) on delete restrict;

update app.class_periods
set schedule_id = (select id from app.class_schedules where name = 'Demais turmas');

alter table app.class_periods alter column schedule_id set not null;

alter table app.class_periods drop constraint class_periods_no_overlap;
alter table app.class_periods add constraint class_periods_no_overlap exclude using gist (
  schedule_id with =,
  tsrange(date '2000-01-01' + start_time, date '2000-01-01' + end_time, '[)') with &&
);

create index class_periods_schedule_idx on app.class_periods (schedule_id);

insert into app.class_periods (schedule_id, name, start_time, end_time)
select s.id, v.name, v.start_time, v.end_time
from app.class_schedules s
cross join (values
  ('1ª aula', time '07:20', time '08:10'),
  ('2ª aula', time '08:10', time '09:00'),
  ('3ª aula', time '09:20', time '10:10'),
  ('4ª aula', time '10:10', time '11:00'),
  ('5ª aula', time '11:00', time '11:50')
) as v (name, start_time, end_time)
where s.name = '6º A, 6º B e 7º ano';

call app.revoke_public_api_access();
