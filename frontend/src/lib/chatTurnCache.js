/** Persist recent user sends locally when server history omits them after a failed step. */

import { pruneCachedUserTurns } from "./chatFailures.js";

const PREFIX = "letta-vision-client/last-user-turn:";

function cacheKey(agentId, conversationId) {
  if (!agentId || !conversationId) return null;
  return `${PREFIX}${agentId}:${conversationId}`;
}

function normalizeStack(data) {
  if (!data) return [];
  if (Array.isArray(data.stack)) return data.stack;
  if (data.userMsg) return [{ userMsg: data.userMsg, outgoing: data.outgoing, savedAt: data.savedAt }];
  return [];
}

export function saveUserTurn(agentId, conversationId, userMsg, outgoing) {
  const key = cacheKey(agentId, conversationId);
  if (!key || typeof localStorage === "undefined") return;
  try {
    const existing = loadUserTurn(agentId, conversationId);
    const stack = normalizeStack(existing);
    stack.push({
      userMsg,
      outgoing,
      savedAt: new Date().toISOString(),
    });
    localStorage.setItem(key, JSON.stringify({ stack: stack.slice(-12) }));
  } catch {
    /* storage full or unavailable */
  }
}

function writeUserTurnStack(key, stack) {
  if (!stack.length) {
    localStorage.removeItem(key);
    return;
  }
  localStorage.setItem(key, JSON.stringify({ stack: stack.slice(-12) }));
}

export function commitUserTurnSuccess(agentId, conversationId, messages = null, { hasMore = false } = {}) {
  const key = cacheKey(agentId, conversationId);
  if (!key || typeof localStorage === "undefined") return;
  try {
    const existing = loadUserTurn(agentId, conversationId);
    let stack = normalizeStack(existing);
    if (!stack.length) return;

    stack.pop();
    if (Array.isArray(messages) && messages.length) {
      const pruned = pruneCachedUserTurns({ stack }, messages, { hasMore });
      stack = pruned ? normalizeStack(pruned) : [];
    }
    writeUserTurnStack(key, stack);
  } catch {
    /* ignore */
  }
}

export function pruneUserTurnCache(agentId, conversationId, messages, { hasMore = false } = {}) {
  const key = cacheKey(agentId, conversationId);
  if (!key || typeof localStorage === "undefined") return;
  try {
    const existing = loadUserTurn(agentId, conversationId);
    const pruned = pruneCachedUserTurns(existing, messages, { hasMore });
    if (pruned === existing) return;
    if (!pruned) {
      localStorage.removeItem(key);
      return;
    }
    writeUserTurnStack(key, normalizeStack(pruned));
  } catch {
    /* ignore */
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
  const stack = normalizeStack(cached);
  const top = stack.at(-1);
  if (!top?.userMsg) return null;
  return { type: "user", key: `cached-user-${top.userMsg.id}`, messages: [top.userMsg] };
}

export function cachedOutgoing(agentId, conversationId) {
  const cached = loadUserTurn(agentId, conversationId);
  const stack = normalizeStack(cached);
  return stack.at(-1)?.outgoing ?? null;
}

export function pendingUserTurnStack(agentId, conversationId) {
  return normalizeStack(loadUserTurn(agentId, conversationId));
}
