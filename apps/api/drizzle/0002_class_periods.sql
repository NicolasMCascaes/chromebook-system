create table app.class_periods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint class_periods_name_not_blank check (length(btrim(name)) > 0),
  constraint class_periods_time_order check (end_time > start_time),
  constraint class_periods_no_overlap exclude using gist (
    tsrange(date '2000-01-01' + start_time, date '2000-01-01' + end_time, '[)') with &&
  )
);

create trigger class_periods_set_updated_at before update on app.class_periods
  for each row execute function app.set_updated_at();

alter table app.class_periods enable row level security;

insert into app.class_periods (name, start_time, end_time) values
  ('1ª aula', '07:20', '08:10'),
  ('2ª aula', '08:10', '09:00'),
  ('3ª aula', '09:00', '09:50'),
  ('4ª aula', '10:10', '11:00'),
  ('5ª aula', '11:00', '11:50');

update app.school_settings
set opening_time = '07:20', closing_time = '11:50'
where id = 1 and opening_time = '07:00' and closing_time = '18:00';

call app.revoke_public_api_access();
