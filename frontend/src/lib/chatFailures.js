/** Detect failed LLM rounds and resolve user content to resend. */

export function unpackPackedFailure(raw) {
  if (!raw) return null;
  if (typeof raw === "object" && raw.type === "system_alert") {
    if (raw.llm_failure_stats || raw.degraded_failure_stats) return raw;
    return null;
  }
  if (typeof raw !== "string") return null;
  try {
    const packed = JSON.parse(raw);
    if (
      packed?.type === "system_alert" &&
      (packed.llm_failure_stats || packed.degraded_failure_stats)
    ) {
      return packed;
    }
  } catch {
    /* not JSON */
  }
  return null;
}

function packedFailureFromContent(content) {
  return unpackPackedFailure(content);
}

const PROVIDER_FAILURE_MARKERS = [
  "The model provider failed to return a usable response",
  "The model provider returned an error and this step could not complete",
];

export function isFailureNoticeText(text) {
  return (
    typeof text === "string" &&
    PROVIDER_FAILURE_MARKERS.some((marker) => text.includes(marker))
  );
}

export function isDismissibleFailureMessage(msg) {
  return isStreamErrorMessage(msg) || isLlmFailureMessage(msg);
}

export function isLlmFailureMessage(msg) {
  if (msg?.injectedContextJson) return true;
  if (msg?.isStreamFailureNotice) return true;
  if (isFailureNoticeText(msg?.content)) return true;
  return Boolean(packedFailureFromContent(msg?.content));
}

export function isRealUserMessage(msg) {
  return msg?.role === "user" && !isLlmFailureMessage(msg);
}

export function isPackedFailurePersistenceRow(raw) {
  if (raw?.message_type !== "user_message") return false;
  const content = typeof raw?.content === "string" ? raw.content : "";
  return Boolean(unpackPackedFailure(content));
}

function failureAttemptsFromRow(raw) {
  const content = typeof raw?.content === "string" ? raw.content : "";
  const packed = unpackPackedFailure(content);
  const stats = packed?.llm_failure_stats || packed?.degraded_failure_stats;
  return stats?.attempts ?? 0;
}

/** Drop duplicate persisted failure rows (same run/step) from server history. */
export function dedupeServerHistory(messages) {
  const keepIndex = new Map();

  messages.forEach((m, i) => {
    if (!isPackedFailurePersistenceRow(m)) return;
    const key = `${m.run_id || ""}:${m.step_id || ""}`;
    const prevIdx = keepIndex.get(key);
    if (prevIdx === undefined) {
      keepIndex.set(key, i);
      return;
    }
    if (failureAttemptsFromRow(m) >= failureAttemptsFromRow(messages[prevIdx])) {
      keepIndex.set(key, i);
    }
  });

  const keptFailureIndices = new Set(keepIndex.values());
  return messages.filter((m, i) => {
    if (!isPackedFailurePersistenceRow(m)) return true;
    return keptFailureIndices.has(i);
  });
}

export function isStreamErrorMessage(msg) {
  return msg?.role === "error";
}

export function isRegeneratableFailure(msg) {
  return isLlmFailureMessage(msg) || isStreamErrorMessage(msg);
}

export function groupEvents(group) {
  if (group?.type === "turn") return group.visible || [];
  if (group?.type === "single") return group.messages || [];
  return [];
}

export function isFailedTurnGroup(group) {
  return groupEvents(group).some(isRegeneratableFailure);
}

export function findPrecedingUserGroup(groups, index) {
  for (let i = index - 1; i >= 0; i--) {
    const group = groups[i];
    if (group?.type === "user" && isRealUserMessage(group.messages?.[0])) {
      return group;
    }
  }
  return null;
}

function normalizeCachedStack(cached) {
  if (!cached) return [];
  if (Array.isArray(cached.stack)) return [...cached.stack];
  if (cached.userMsg) {
    return [{ userMsg: cached.userMsg, outgoing: cached.outgoing, savedAt: cached.savedAt }];
  }
  return [];
}

function outgoingSignature(outgoing) {
  if (typeof outgoing === "string") return `text:${outgoing}`;
  if (!Array.isArray(outgoing)) return null;
  return JSON.stringify(
    outgoing.map((block) => {
      if (block?.type === "text") return { t: "text", v: block.text };
      if (block?.type === "image") {
        const data = block.source?.data;
        return { t: "image", d: typeof data === "string" ? data.slice(0, 64) : "" };
      }
      return block;
    })
  );
}

/** True when server history already contains this cached send (avoid duplicate bubbles). */
export function userTurnPresentInHistory(entry, messages) {
  if (!entry?.userMsg) return false;
  const sig = outgoingSignature(entry.outgoing);
  const text = typeof entry.userMsg.content === "string" ? entry.userMsg.content.trim() : "";

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (!isRealUserMessage(msg)) continue;
    if (entry.userMsg.id && msg.id === entry.userMsg.id) return true;

    const msgOutgoing = outgoingFromUserMessage(msg);
    if (sig && outgoingSignature(msgOutgoing) === sig) return true;

    if (text && typeof msg.content === "string" && msg.content.trim() === text) {
      const hasBlocks = Boolean(msg.contentBlocks?.length);
      const entryHasBlocks = Boolean(entry.userMsg.contentBlocks?.length);
      if (hasBlocks === entryHasBlocks) return true;
    }
  }
  return false;
}

export function topPendingUserTurn(cached) {
  const stack = normalizeCachedStack(cached);
  return stack.at(-1) ?? null;
}

function oldestNonSystemDate(messages) {
  let oldest = null;
  for (const msg of messages) {
    if (msg.role === "system") continue;
    const parsed = msg.date ? Date.parse(msg.date) : NaN;
    if (Number.isNaN(parsed)) continue;
    if (oldest === null || parsed < oldest) oldest = parsed;
  }
  return oldest;
}

/** Cached turn is probably persisted but not in the current history window yet. */
function cachedTurnLikelyOnUnloadedServerPage(entry, messages, hasMore) {
  if (!hasMore) return false;
  const entryDate = entry.userMsg?.date ? Date.parse(entry.userMsg.date) : NaN;
  if (Number.isNaN(entryDate)) return false;
  const oldest = oldestNonSystemDate(messages);
  if (oldest === null) return false;
  return entryDate < oldest;
}

/** Drop local-only user bubbles when the server copy is already in the thread. */
export function dropSupersededLocalUserBubbles(messages) {
  const serverUsers = messages.filter(
    (m) => isRealUserMessage(m) && !String(m.id).startsWith("local-")
  );
  if (!serverUsers.length) return messages;

  return messages.filter((msg) => {
    if (!isRealUserMessage(msg) || !String(msg.id).startsWith("local-")) return true;
    return !userTurnPresentInHistory({ userMsg: msg }, serverUsers);
  });
}

export function mergeCachedUserTurn(cached, messages, { hasMore = false } = {}) {
  const stack = normalizeCachedStack(cached);
  if (!stack.length) return messages;

  let out = [...messages];
  const remaining = [...stack];

  for (let fi = out.length - 1; fi >= 0 && remaining.length; fi--) {
    if (!isRegeneratableFailure(out[fi])) continue;
    const prev = fi > 0 ? out[fi - 1] : null;
    if (prev && isRealUserMessage(prev)) continue;
    const entry = remaining.pop();
    if (!entry?.userMsg) continue;
    if (cachedTurnLikelyOnUnloadedServerPage(entry, out, hasMore)) continue;
    out = [
      ...out.slice(0, fi),
      { ...entry.userMsg, role: "user", type: "user_message", collapsed: false },
      ...out.slice(fi),
    ];
  }

  for (const entry of remaining) {
    if (!entry?.userMsg) continue;
    if (userTurnPresentInHistory(entry, out)) continue;
    if (cachedTurnLikelyOnUnloadedServerPage(entry, out, hasMore)) continue;
    out = [
      ...out,
      { ...entry.userMsg, role: "user", type: "user_message", collapsed: false },
    ];
  }

  return out;
}

/** User turn to resend when regenerating a failure group in the transcript. */
export function userGroupForFailedTurn(groups, groupIndex, cachedUserGroup) {
  const group = groups[groupIndex];
  const isFailure =
    group?.type === "single"
      ? group.messages?.some(isRegeneratableFailure)
      : isFailedTurnGroup(group);
  if (!isFailure) {
    return findPrecedingUserGroup(groups, groupIndex) || cachedUserGroup;
  }

  const prev = groupIndex > 0 ? groups[groupIndex - 1] : null;
  if (prev?.type === "user" && isRealUserMessage(prev.messages?.[0])) {
    return prev;
  }

  return cachedUserGroup || findPrecedingUserGroup(groups, groupIndex);
}

export function failureInjectedJsonFromContent(content) {
  const packed = unpackPackedFailure(content);
  if (!packed) return null;
  try {
    return JSON.stringify(packed, null, 2);
  } catch {
    return typeof content === "string" ? content : null;
  }
}

export function enrichStreamFailureRow(row, content) {
  const packed = unpackPackedFailure(content);
  if (packed) {
    row.injectedContextJson = failureInjectedJsonFromContent(content);
    row.content = stripFailureNoticeText(packed.message || row.content);
    return row;
  }
  if (isFailureNoticeText(content)) {
    row.injectedContextJson = row.injectedContextJson || null;
    row.isStreamFailureNotice = true;
  }
  return row;
}

function stripFailureNoticeText(text) {
  if (!text || typeof text !== "string") return text;
  const marker = "```json";
  const idx = text.indexOf(marker);
  if (idx === -1) return text;
  return text.slice(0, idx).trimEnd() || text;
}

/** Convert history/SDK blocks into the bridge POST schema (base64 image sources). */
export function normalizeOutgoingForSend(outgoing) {
  if (outgoing == null) return null;
  if (typeof outgoing === "string") {
    const text = outgoing.trim();
    return text || null;
  }
  if (!Array.isArray(outgoing)) return null;

  const parts = [];
  for (const block of outgoing) {
    if (!block || typeof block !== "object") continue;
    if (block.type === "text") {
      const text = typeof block.text === "string" ? block.text.trim() : "";
      if (text) parts.push({ type: "text", text });
      continue;
    }
    if (block.type === "image") {
      const src = block.source || {};
      const data = typeof src.data === "string" ? src.data : "";
      if (!data) continue;
      const media_type =
        typeof src.media_type === "string" && src.media_type
          ? src.media_type
          : "image/png";
      parts.push({
        type: "image",
        source: { type: "base64", media_type, data },
      });
    }
  }

  if (!parts.length) return null;
  if (parts.length === 1 && parts[0].type === "text") return parts[0].text;
  return parts;
}

export function outgoingFromUserMessage(msg) {
  if (!msg) return null;
  if (Array.isArray(msg.contentBlocks) && msg.contentBlocks.length) {
    return normalizeOutgoingForSend(msg.contentBlocks);
  }
  const text = typeof msg.content === "string" ? msg.content.trim() : "";
  return normalizeOutgoingForSend(text);
}

export function turnMessageIds(group) {
  return new Set(groupEvents(group).map((m) => m.id));
}

export function outgoingHasImage(outgoing) {
  return Array.isArray(outgoing) && outgoing.some((b) => b?.type === "image");
}
