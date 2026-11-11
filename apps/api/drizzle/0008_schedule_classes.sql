alter table app.class_schedules add column class_names text[] not null default '{}';

update app.class_schedules set class_names = '{"6º A","6º B","7º ano"}' where name = '6º A, 6º B e 7º ano';
update app.class_schedules set class_names = '{"5º A","5º B","8º A","8º B","9º ano"}' where name = 'Demais turmas';

call app.revoke_public_api_access();
