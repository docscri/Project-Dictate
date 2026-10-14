alter table consultations
add column if not exists signed_at timestamp with time zone;
