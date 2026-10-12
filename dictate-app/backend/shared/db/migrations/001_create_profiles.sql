create table if not exists profiles (
    id uuid primary key,
    email text,
    name text,
    specialty text,
    created_at timestamp with time zone default now()
)