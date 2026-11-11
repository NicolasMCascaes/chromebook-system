\set ON_ERROR_STOP on

select format('create role chromebook_test login password %L', :'test_password')
where not exists (select 1 from pg_roles where rolname = 'chromebook_test') \gexec

select format('alter role chromebook_test with login password %L', :'test_password') \gexec

select 'create database chromebook_test owner chromebook_test'
where not exists (select 1 from pg_database where datname = 'chromebook_test') \gexec

select 'create role anon nologin'
where not exists (select 1 from pg_roles where rolname = 'anon') \gexec

select 'create role authenticated nologin'
where not exists (select 1 from pg_roles where rolname = 'authenticated') \gexec

grant anon, authenticated to chromebook_test with inherit false, set true;
