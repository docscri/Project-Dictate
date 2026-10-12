-- Supports doctor-scoped newest-first pages and patient lookups.
create index if not exists consultations_doctor_created_id_idx
    on consultations (doctor_id, created_at desc, id desc);
create index if not exists patients_doctor_id_idx on patients (doctor_id);

-- Substring ILIKE searches cannot use an ordinary name btree index.
create extension if not exists pg_trgm;
create index if not exists patients_name_trgm_idx on patients using gin (name gin_trgm_ops);
