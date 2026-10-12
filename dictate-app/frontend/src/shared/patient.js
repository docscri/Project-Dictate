export function patientTitle(patient) {
  if (!patient) return '';
  return [patient.name, patient.age != null ? String(patient.age) : null].filter((value) => value != null && value !== '').join(', ');
}
export function patientMeta(patient) {
  if (!patient) return '';
  return [patient.age != null ? String(patient.age) : null, patient.sex ? patient.sex[0].toUpperCase() + patient.sex.slice(1) : null].filter((value) => value != null && value !== '').join(' · ');
}
export function initials(name = '') {
  return name.replace(/^Dr\.?\s*/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}
