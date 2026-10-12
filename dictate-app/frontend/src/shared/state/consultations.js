const fields = ['id', 'doctor_id', 'patient_id', 'status', 'created_at', 'patient'];
export function consultationSummary(record) {
  return Object.fromEntries(fields.filter(key => Object.hasOwn(record, key)).map(key => [key, record[key]]));
}
export function mergeConsultationPage(previous, incoming) {
  const rows = new Map(previous.map(row => [row.id, row]));
  for (const row of incoming) rows.set(row.id, consultationSummary(row));
  return [...rows.values()].sort((left, right) =>
    (right.created_at ?? '').localeCompare(left.created_at ?? '') || right.id.localeCompare(left.id));
}
export function updateConsultationSummaries(items, record) {
  const changes = consultationSummary(record);
  let changed = false;
  const updated = items.map(row => {
    if (row.id !== record.id || Object.keys(changes).every(key => Object.is(row[key], changes[key]))) return row;
    changed = true; return { ...row, ...changes };
  });
  return changed ? updated : items;
}
