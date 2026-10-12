export function nextEnabledTab(items, active, key) {
  const values = items.filter(item => typeof item === 'string' || !item.disabled).map(item => typeof item === 'string' ? item : item.value);
  if (!values.length) return null;
  if (key === 'Home') return values[0];
  if (key === 'End') return values.at(-1);
  const direction = key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : 0;
  if (!direction) return null;
  const index = Math.max(0, values.indexOf(active));
  return values[(index + direction + values.length) % values.length];
}
