/** Ensure every message has a unique id for Svelte keyed each blocks. */
export function withUniqueMessageIds(msgs) {
  const seen = new Set();
  return msgs.map((m, i) => {
    let id = m.id || `msg-${i}`;
    while (seen.has(id)) {
      id = `${id}~${i}`;
    }
    seen.add(id);
    return { ...m, id };
  });
}

export function messageListKey(msg, index) {
  return `${msg.id}-${index}`;
}

/** Oldest-first ordering for chat display (system context at top). */
export function sortMessagesChronological(msgs) {
  return [...msgs].sort(compareMessagesChronological);
}

export function compareMessagesChronological(a, b) {
  const roleRank = (m) => (m.role === "system" ? 0 : 1);
  const rankDiff = roleRank(a) - roleRank(b);
  if (rankDiff !== 0) return rankDiff;

  const sa = a.seq_id ?? null;
  const sb = b.seq_id ?? null;
  if (sa != null && sb != null) {
    if (sa !== sb) return sa - sb;
    const subA = a.seq_sub ?? 0;
    const subB = b.seq_sub ?? 0;
    if (subA !== subB) return subA - subB;
  }

  const da = a.date ? Date.parse(a.date) : NaN;
  const db = b.date ? Date.parse(b.date) : NaN;
  if (!Number.isNaN(da) && !Number.isNaN(db) && da !== db) return da - db;

  const fallbackA = a.seq_id ?? 0;
  const fallbackB = b.seq_id ?? 0;
  if (fallbackA !== fallbackB) return fallbackA - fallbackB;

  return String(a.id).localeCompare(String(b.id));
}
