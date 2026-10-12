create table if not exists patients (
    id uuid primary key default gen_random_uuid(),
    doctor_id uuid not null,
    name text not null,
    age integer,
    sex text,
    patient_id text,
    created_at timestamp with time zone default now()
);