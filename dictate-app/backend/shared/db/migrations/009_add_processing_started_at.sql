alter table consultations
add column if not exists processing_started_at timestamp with time zone;

-- Give already-processing rows a recovery clock when this migration is applied.
update consultations
set processing_started_at = coalesce(updated_at, created_at, now())
where status = 'processing'
  and processing_started_at is null;
