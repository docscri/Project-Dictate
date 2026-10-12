create table if not exists consultations (
    id uuid primary key default gen_random_uuid(),
    doctor_id uuid not null,
    patient_id uuid not null references patients(id),
    status text default 'ready',
    transcript text,
    terms jsonb,
    note jsonb,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);