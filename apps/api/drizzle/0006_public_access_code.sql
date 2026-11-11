alter table app.school_settings
  add column public_access_code text not null default replace(gen_random_uuid()::text, '-', '');

alter table app.school_settings
  add constraint school_settings_public_access_code_valid check (public_access_code ~ '^[A-Za-z0-9_-]{16,128}$');

call app.revoke_public_api_access();
