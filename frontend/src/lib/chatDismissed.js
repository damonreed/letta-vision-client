/** Hide chat rows the user removed locally (no server delete API yet). */

const PREFIX = "letta-vision-client/dismissed:";

function cacheKey(agentId, conversationId) {
  if (!agentId || !conversationId) return null;
  return `${PREFIX}${agentId}:${conversationId}`;
}

export function loadDismissedIds(agentId, conversationId) {
  const key = cacheKey(agentId, conversationId);
  if (!key || typeof localStorage === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

export function saveDismissedIds(agentId, conversationId, ids) {
  const key = cacheKey(agentId, conversationId);
  if (!key || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify([...ids]));
  } catch {
    /* storage full or unavailable */
  }
}

export function dismissMessageId(agentId, conversationId, messageId) {
  if (!messageId) return;
  const ids = loadDismissedIds(agentId, conversationId);
  ids.add(messageId);
  saveDismissedIds(agentId, conversationId, ids);
}

export function filterDismissedMessages(messages, agentId, conversationId) {
  const dismissed = loadDismissedIds(agentId, conversationId);
  if (!dismissed.size) return messages;
  return messages.filter((m) => !dismissed.has(m.id));
}
