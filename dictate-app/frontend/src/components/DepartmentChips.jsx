import Chip from './Chip.jsx';
import { departments } from '../shared/account.js';

export default function DepartmentChips({ value, onChange, disabled = false, invalid = false }) {
  return <div className="department-chips" role="group" aria-label="Department" aria-invalid={invalid}>{departments.map((department) => <Chip key={department} label={department} selected={value === department} onSelect={onChange} disabled={disabled} />)}</div>;
}
