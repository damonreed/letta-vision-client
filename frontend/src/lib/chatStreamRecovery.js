/** Detect stalled SSE streams and surface recovery reasons for the chat UI. */

export const DEFAULT_STREAM_STALL_MS = 90_000;
export const DEFAULT_STREAM_MAX_MS = 600_000;
export const STALL_CHECK_INTERVAL_MS = 5_000;
export const VISIBILITY_RECOVER_MS = 30_000;

export const RECOVERY_MESSAGES = {
  stall: "Stream stalled with no updates — synced conversation from server.",
  maxDuration: "Stream exceeded the maximum duration — synced conversation from server.",
  abrupt: "Connection closed before the stream finished — synced conversation from server.",
  visibility: "Tab was inactive — refreshed conversation from server.",
  online: "Network reconnected — refreshed conversation from server.",
  manual: "Conversation refreshed from server.",
  cancel: "Send cancelled — synced conversation from server.",
};

export function isKeepaliveEvent(event) {
  return event?.type === "keepalive" || event?.type === "ping";
}

export function isTerminalStreamEvent(event) {
  return event?.type === "done" || event?.type === "error";
}

export function createStreamWatchdog({
  stallMs = DEFAULT_STREAM_STALL_MS,
  maxMs = DEFAULT_STREAM_MAX_MS,
  onStall,
  onMaxDuration,
  checkIntervalMs = STALL_CHECK_INTERVAL_MS,
} = {}) {
  let lastActivityAt = Date.now();
  let startedAt = Date.now();
  let timer = null;
  let stallTriggered = false;
  let maxTriggered = false;

  function touch() {
    lastActivityAt = Date.now();
  }

  function start() {
    startedAt = Date.now();
    touch();
    stop();
    timer = setInterval(() => {
      const now = Date.now();
      if (maxMs > 0 && !maxTriggered && now - startedAt >= maxMs) {
        maxTriggered = true;
        onMaxDuration?.();
        return;
      }
      if (stallMs > 0 && !stallTriggered && now - lastActivityAt >= stallMs) {
        stallTriggered = true;
        onStall?.();
      }
    }, checkIntervalMs);
  }

  function stop() {
    if (timer != null) {
      clearInterval(timer);
      timer = null;
    }
  }

  return { touch, start, stop };
}
