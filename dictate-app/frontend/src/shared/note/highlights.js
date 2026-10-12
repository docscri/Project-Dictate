// Match extracted term text. Server character offsets are deliberately unused.
export function highlightedParts(text, terms = [], highlights = [], section) {
  const assigned = highlights.filter(item => item.section === section);
  const choices = terms.filter(term => !term.section || term.section === section).map(term => term.text).filter(Boolean);
  const candidates = [...choices, ...assigned.map(item => item.text).filter(text => choices.some(term => text.toLocaleLowerCase().includes(term.toLocaleLowerCase())))];
  const matches = [];
  for (const term of new Set(candidates)) {
    const escaped = term.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
    if (!escaped) continue;
    const pattern = new RegExp(escaped, 'giu');
    for (const match of text.matchAll(pattern)) {
      const start = match.index, end = start + match[0].length;
      if ((start && /[\p{L}\p{N}_]/u.test(text[start - 1])) || (end < text.length && /[\p{L}\p{N}_]/u.test(text[end]))) continue;
      matches.push({ start, end });
    }
  }
  matches.sort((a, b) => a.start - b.start || b.end - a.end);
  const parts = []; let cursor = 0;
  for (const match of matches) {
    if (match.start < cursor) continue;
    if (match.start > cursor) parts.push({ text: text.slice(cursor, match.start), highlighted: false });
    parts.push({ text: text.slice(match.start, match.end), highlighted: true }); cursor = match.end;
  }
  if (cursor < text.length || !parts.length) parts.push({ text: text.slice(cursor), highlighted: false });
  return parts;
}
