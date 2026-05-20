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

  const da = a.date ? Date.parse(a.date) : NaN;
  const db = b.date ? Date.parse(b.date) : NaN;
  if (!Number.isNaN(da) && !Number.isNaN(db) && da !== db) return da - db;

  const sa = a.seq_id ?? 0;
  const sb = b.seq_id ?? 0;
  if (sa !== sb) return sa - sb;

  return String(a.id).localeCompare(String(b.id));
}
