/** Persist the last user turn locally when server history omits it after a failed step. */

const PREFIX = "letta-vision-client/last-user-turn:";

function cacheKey(agentId, conversationId) {
  if (!agentId || !conversationId) return null;
  return `${PREFIX}${agentId}:${conversationId}`;
}

export function saveUserTurn(agentId, conversationId, userMsg, outgoing) {
  const key = cacheKey(agentId, conversationId);
  if (!key || typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      key,
      JSON.stringify({
        userMsg,
        outgoing,
        savedAt: new Date().toISOString(),
      })
    );
  } catch {
    /* storage full or unavailable */
  }
}

export function loadUserTurn(agentId, conversationId) {
  const key = cacheKey(agentId, conversationId);
  if (!key || typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function cachedUserGroup(agentId, conversationId) {
  const cached = loadUserTurn(agentId, conversationId);
  if (!cached?.userMsg) return null;
  return { type: "user", key: `cached-user-${cached.userMsg.id}`, messages: [cached.userMsg] };
}

export function cachedOutgoing(agentId, conversationId) {
  return loadUserTurn(agentId, conversationId)?.outgoing ?? null;
}
