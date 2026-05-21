<script>
  import { onDestroy, onMount, tick } from "svelte";
  import DOMPurify from "dompurify";
  import { marked } from "marked";
  import { api } from "../lib/api.js";
  import { messageListKey, sortMessagesChronological, withUniqueMessageIds } from "../lib/messages.js";
  import { buildDisplayGroups } from "../lib/chatDisplay.js";
  import { parseContent, imageSrcFromBlock, previewSrcForAttachment } from "../lib/contentBlocks.js";
  import {
    buildMessageContent,
    fileToImageBlock,
    fetchUrlToImageBlock,
  } from "../lib/imagePipeline.ts";
  import AttachmentThumbnail from "../lib/components/AttachmentThumbnail.svelte";
  import ImageViewer from "../lib/components/ImageViewer.svelte";
  import ToolResultImage from "../lib/components/ToolResultImage.svelte";
  import {
    getToolResultBlocks,
    getToolResultDisplayImages,
    getToolResultText,
    redactToolResultDisplayText,
  } from "../lib/toolResultImages.js";
  import ConversationList from "../lib/ConversationList.svelte";
  import {
    activeConversationId,
    agents,
    loadChatDraft,
    loadSelectedAgent,
    pickConversationForAgent,
    saveChatDraft,
    saveSelectedAgent,
    selectedAgentId,
    modelsCache,
    modelSupportsVision,
  } from "../lib/stores.js";

  let agentList = $state([]);
  let agentId = $state(null);
  let conversationId = $state(null);
  let messages = $state([]);
  let input = $state("");
  let streaming = $state(false);
  let error = $state("");
  let showMemory = $state(false);
  let memoryBlocks = $state([]);
  let expanded = $state({});
  let expandedTurns = $state({});
  let listEl = $state(null);
  let historyRequest = 0;
  let stickToBottom = $state(true);
  let draftAgentId = null;
  let draftConversationId = null;
  /** @type {{ abort: AbortController, agentId: string, conversationId: string, streamId: number } | null} */
  let activeStream = null;
  let streamIdCounter = 0;
  let pendingAttachment = $state(null);
  let modelsList = $state([]);
  let showUrlAttach = $state(false);
  let urlAttachInput = $state("");
  let dropOverlay = $state(false);
  let viewerSrc = $state(null);
  let viewerOpen = $state(false);
  let fileInput = $state(null);

  const activeAgent = $derived(agentList.find((a) => a.id === agentId));
  const visionCapable = $derived(
    modelSupportsVision(activeAgent?.model, modelsList)
  );

  const SCROLL_BOTTOM_THRESHOLD = 64;

  const displayGroups = $derived(buildDisplayGroups(messages));

  function isNearBottom(el = listEl, threshold = SCROLL_BOTTOM_THRESHOLD) {
    if (!el) return true;
    return el.scrollHeight - el.clientHeight - el.scrollTop <= threshold;
  }

  function onMessagesScroll() {
    stickToBottom = isNearBottom();
  }

  $effect(() => {
    if (!stickToBottom || !listEl) return;
    // Track length and last message content so streaming updates trigger scroll.
    const last = messages.at(-1);
    void messages.length;
    void last?.content;
    void last?.reasoning;
    scrollToBottom();
  });

  $effect(() => {
    const same =
      agentId === draftAgentId && conversationId === draftConversationId;
    if (same) return;

    if (draftAgentId != null && draftConversationId != null) {
      saveChatDraft(draftAgentId, draftConversationId, input);
    }

    draftAgentId = agentId;
    draftConversationId = conversationId;
    input =
      agentId && conversationId ? loadChatDraft(agentId, conversationId) : "";
  });

  onDestroy(() => {
    stopActiveStream();
    if (agentId && conversationId) saveChatDraft(agentId, conversationId, input);
  });

  function stopActiveStream() {
    if (!activeStream) return;
    activeStream.abort.abort();
    activeStream = null;
    streaming = false;
  }

  function isCurrentStream(streamId) {
    return activeStream?.streamId === streamId;
  }

  onMount(() => {
    loadAgents();
    const u1 = agents.subscribe((a) => (agentList = a));
    const u2 = selectedAgentId.subscribe((id) => {
      if (id) {
        agentId = id;
        loadMemory(id);
      }
    });
    const u3 = activeConversationId.subscribe((cid) => {
      conversationId = cid;
    });
    return () => {
      u1();
      u2();
      u3();
    };
  });

  $effect(() => {
    const aid = agentId;
    const cid = conversationId;
    stopActiveStream();
    if (aid && cid) {
      loadHistory(aid, cid);
    } else {
      messages = [];
    }
  });

  async function loadAgents() {
    try {
      const [a, models] = await Promise.all([api.listAgents(), api.listModels()]);
      modelsList = Array.isArray(models) ? models : [];
      modelsCache.set(modelsList);
      agents.set(a);
      if (!agentId && a.length) {
        const saved = loadSelectedAgent();
        const pick =
          saved && a.some((ag) => ag.id === saved) ? saved : a[0].id;
        agentId = pick;
        selectedAgentId.set(agentId);
        activeConversationId.set(pickConversationForAgent(pick));
      }
    } catch (err) {
      error = err.message;
    }
  }

  async function onAgentChange(e) {
    const id = e.target.value;
    agentId = id;
    selectedAgentId.set(id);
    saveSelectedAgent(id);
    historyRequest++;
    messages = [];
    activeConversationId.set(pickConversationForAgent(id));
    await loadMemory(id);
  }

  async function loadHistory(id, convId = conversationId) {
    if (!id || !convId) return;
    const requestId = ++historyRequest;
    error = "";
    try {
      const hist = await api.getHistory(id, convId);
      if (requestId !== historyRequest) return;
      const normalized = sortMessagesChronological(
        hist.map(normalizeMessage).filter(Boolean)
      );
      messages = withUniqueMessageIds(normalized);
      stickToBottom = true;
      await scrollToBottom();
    } catch (err) {
      if (requestId !== historyRequest) return;
      error = err.message;
    }
  }

  async function loadMemory(id) {
    try {
      memoryBlocks = await api.listBlocks(id);
    } catch {
      memoryBlocks = [];
    }
  }

  function systemExpandedKey(id) {
    return `letta-vision-client-system-expanded-${id}`;
  }

  function legacySystemExpandedKey(id) {
    return `letta-bridge-system-expanded-${id}`;
  }

  function isSystemExpanded(id) {
    if (typeof localStorage === "undefined") return false;
    return (
      localStorage.getItem(systemExpandedKey(id)) === "1" ||
      localStorage.getItem(legacySystemExpandedKey(id)) === "1"
    );
  }

  function setSystemExpanded(id, open) {
    localStorage.setItem(systemExpandedKey(id), open ? "1" : "0");
    localStorage.removeItem(legacySystemExpandedKey(id));
  }

  function systemSummary(content) {
    const text = typeof content === "string" ? content : JSON.stringify(content);
    const blockCount = (text.match(/<memory_blocks>/g) || []).length
      ? (text.match(/label=/gi) || []).length
      : 0;
    const blocks = blockCount || (text.includes("memory") ? "?" : "0");
    return `System context (${blocks} memory blocks, ${text.length} chars)`;
  }

  function unpackLlmFailurePacked(raw) {
    if (!raw) return null;
    try {
      const packed = JSON.parse(raw);
      if (
        packed?.type === "system_alert" &&
        (packed.llm_failure_stats || packed.degraded_failure_stats)
      ) {
        return packed;
      }
    } catch {
      /* not packed JSON */
    }
    return null;
  }

  function unpackLlmFailureNotice(m) {
    if (m?.llm_failure_stats || m?.degraded_failure_stats) {
      return typeof m.summary === "string" ? m.summary : null;
    }
    let raw = null;
    if (typeof m?.content === "string") raw = m.content;
    else if (Array.isArray(m?.content) && m.content[0]?.text) raw = m.content[0].text;
    const packed = unpackLlmFailurePacked(raw);
    return packed?.message || null;
  }

  function llmFailureInjectedJson(m) {
    let raw = null;
    if (typeof m?.content === "string") raw = m.content;
    else if (Array.isArray(m?.content) && m.content[0]?.text) raw = m.content[0].text;
    const packed = unpackLlmFailurePacked(raw);
    if (!packed) return null;
    try {
      return JSON.stringify(packed, null, 2);
    } catch {
      return raw;
    }
  }

  /** Legacy stream appended a second assistant chunk with fenced JSON; strip from main text. */
  function stripEmbeddedFailureJsonFence(text) {
    if (!text || typeof text !== "string") return text;
    const marker = "```json";
    const idx = text.indexOf(marker);
    if (idx === -1) return text;
    const before = text.slice(0, idx).trimEnd();
    return before || text;
  }

  function isLegacyInjectedJsonStreamMessage(event) {
    const id = event?.id || "";
    if (typeof id === "string" && id.endsWith("-injected-json")) return true;
    const content = typeof event?.content === "string" ? event.content : "";
    return content.trimStart().startsWith("```json");
  }

  function normalizeMessage(m) {
    if (typeof m?.id === "string" && m.id.endsWith("-injected-json")) {
      return null;
    }
    const failureNotice = unpackLlmFailureNotice(m);
    const injectedJson = llmFailureInjectedJson(m);
    const type = m.message_type || "unknown";
    let role = "system";
    if (type === "error_message") role = "error";
    else if (failureNotice) role = "agent";
    else if (type === "user_message") role = "user";
    else if (type === "assistant_message" || type === "summary_message") role = "agent";
    else if (type === "tool_call_message") role = "tool_call";
    else if (type === "tool_return_message") role = "tool_result";
    else if (type === "reasoning_message" || type === "hidden_reasoning_message")
      role = "reasoning";
    else if (type === "system_message") role = "system";

    let content = "";
    let contentBlocks = null;

    if (role === "reasoning") {
      content = extractReasoning(m);
    } else if (role === "tool_result" || m.tool_return != null || m.tool_returns?.length) {
      const blocks = getToolResultBlocks(m);
      if (blocks) {
        content = parseContent(blocks).text;
      } else {
        content = getToolResultText(m);
        if (!content && m.tool_return != null) {
          content =
            typeof m.tool_return === "string"
              ? m.tool_return
              : JSON.stringify(m.tool_return, null, 2);
        }
      }
    } else if (failureNotice) {
      content = stripEmbeddedFailureJsonFence(failureNotice);
    } else if (type === "error_message") {
      content = m.message || m.content || "";
    } else if (type === "summary_message" && typeof m.summary === "string") {
      content = m.summary;
    } else if (m.content != null) {
      if (typeof m.content === "string") {
        content = m.content;
      } else if (Array.isArray(m.content)) {
        const parsed = parseContent(m.content);
        content = parsed.text;
        contentBlocks = m.content;
      } else {
        content = JSON.stringify(m.content, null, 2);
      }
    } else if (m.tool_call) {
      content = JSON.stringify(m.tool_call, null, 2);
    }

    const toolDisplayImages =
      role === "tool_result" ? getToolResultDisplayImages(m) : [];

    const id = m.id || crypto.randomUUID();
    const systemCollapsed = role === "system" && agentId && !isSystemExpanded(agentId);

    if (role === "tool_result" && content) {
      content = redactToolResultDisplayText(content);
    }

    return {
      id,
      role,
      type,
      content,
      contentBlocks,
      toolDisplayImages,
      injectedContextJson: injectedJson,
      errorDetail:
        type === "error_message"
          ? m.upstream_error || m.detail || null
          : null,
      date: m.date,
      seq_id: m.seq_id ?? null,
      collapsed:
        ["tool_call", "tool_result", "reasoning"].includes(role) || systemCollapsed,
      systemSummary: role === "system" ? systemSummary(content) : null,
    };
  }

  function toggleSystemContext() {
    if (!agentId) return;
    const next = !isSystemExpanded(agentId);
    setSystemExpanded(agentId, next);
    messages = messages.map((m) =>
      m.role === "system"
        ? { ...m, collapsed: !next, systemSummary: systemSummary(m.content) }
        : m
    );
  }

  async function scrollToBottom() {
    await tick();
    requestAnimationFrame(() => {
      if (listEl) listEl.scrollTop = listEl.scrollHeight;
    });
  }

  function toggleExpand(id) {
    expanded = { ...expanded, [id]: !expanded[id] };
  }

  function toggleTurnExpand(key) {
    expandedTurns = { ...expandedTurns, [key]: !expandedTurns[key] };
  }

  function extractReasoning(event) {
    return (
      event.reasoning ||
      event.hidden_reasoning ||
      (typeof event.content === "string" ? event.content : "")
    );
  }


  function openViewer(src) {
    viewerSrc = src;
    viewerOpen = true;
  }

  async function attachFile(file) {
    if (!file || !file.type.startsWith("image/")) {
      error = "Only image files can be attached.";
      return;
    }
    error = "";
    try {
      pendingAttachment = await fileToImageBlock(file);
    } catch (err) {
      error = err.message;
    }
  }

  function onFilePick(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) attachFile(file);
  }

  function onDragOver(e) {
    e.preventDefault();
    dropOverlay = true;
  }

  function onDragLeave() {
    dropOverlay = false;
  }

  async function onDrop(e) {
    e.preventDefault();
    dropOverlay = false;
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      error = "Only image files can be attached.";
      return;
    }
    await attachFile(file);
  }

  async function onPaste(e) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) await attachFile(file);
        return;
      }
    }
  }

  async function attachFromUrl() {
    const url = urlAttachInput.trim();
    if (!url) return;
    error = "";
    try {
      pendingAttachment = await fetchUrlToImageBlock(url);
      showUrlAttach = false;
      urlAttachInput = "";
    } catch (err) {
      error = err.message.includes("fetch")
        ? err.message
        : `Could not attach image: ${err.message}`;
    }
  }

  function clearAttachment() {
    pendingAttachment = null;
  }

  async function send() {
    const text = input.trim();
    const attachment = pendingAttachment;
    if ((!text && !attachment) || !agentId || streaming) return;
    if (attachment && !visionCapable) {
      error = "This agent's model can't see images. Switch to a vision-capable agent.";
      return;
    }

    const streamAgentId = agentId;
    const streamConversationId = conversationId;
    const streamId = ++streamIdCounter;
    const abort = new AbortController();
    activeStream = {
      abort,
      agentId: streamAgentId,
      conversationId: streamConversationId,
      streamId,
    };

    input = "";
    saveChatDraft(streamAgentId, streamConversationId, "");
    streaming = true;
    stickToBottom = true;
    error = "";

    const outgoing = buildMessageContent(text, attachment);
    const userMsg = {
      id: `local-${Date.now()}`,
      role: "user",
      type: "user_message",
      content: typeof outgoing === "string" ? outgoing : text || "",
      contentBlocks: Array.isArray(outgoing) ? outgoing : null,
      date: new Date().toISOString(),
      collapsed: false,
    };
    pendingAttachment = null;
    messages = withUniqueMessageIds([...messages, userMsg]);
    await scrollToBottom();

    let assistantIdx = null;
    let pendingReasoning = "";
    let streamPart = 0;

    try {
      for await (const event of api.streamMessage(
        streamAgentId,
        outgoing,
        streamConversationId,
        { signal: abort.signal }
      )) {
        if (!isCurrentStream(streamId)) return;

        if (event.type === "reasoning") {
          pendingReasoning += extractReasoning(event);
          if (assistantIdx === null) {
            const row = {
              id: event.id
                ? `${event.id}-reasoning`
                : `stream-reasoning-${Date.now()}`,
              role: "agent",
              type: "assistant_message",
              content: "",
              reasoning: pendingReasoning,
              date: event.date,
              collapsed: false,
            };
            messages = withUniqueMessageIds([...messages, row]);
            assistantIdx = messages.length - 1;
          } else {
            messages[assistantIdx].reasoning = pendingReasoning;
            messages = [...messages];
          }
        } else if (event.type === "message") {
          if (isLegacyInjectedJsonStreamMessage(event)) {
            continue;
          }
          const chunk =
            typeof event.content === "string"
              ? event.content
              : extractText(event.content);
          if (assistantIdx === null) {
            const row = {
              id: event.id
                ? `${event.id}-part-${streamPart++}`
                : `stream-${Date.now()}-${streamPart++}`,
              role: "agent",
              type: "assistant_message",
              content: chunk,
              reasoning: pendingReasoning || undefined,
              date: event.date,
              collapsed: false,
            };
            messages = withUniqueMessageIds([...messages, row]);
            assistantIdx = messages.length - 1;
          } else {
            const merged = (messages[assistantIdx].content || "") + (chunk || "");
            messages[assistantIdx].content = stripEmbeddedFailureJsonFence(merged);
            messages = [...messages];
          }
        } else if (event.type === "tool_call") {
          const toolCallRow = normalizeMessage({
            ...event,
            message_type: "tool_call_message",
          });
          if (toolCallRow) {
            messages = withUniqueMessageIds([...messages, toolCallRow]);
          }
          assistantIdx = null;
          pendingReasoning = "";
        } else if (event.type === "tool_result") {
          const toolResultRow = normalizeMessage({
            ...event,
            message_type: "tool_return_message",
          });
          if (toolResultRow) {
            messages = withUniqueMessageIds([...messages, toolResultRow]);
          }
          assistantIdx = null;
        } else if (event.type === "done") {
          break;
        } else if (event.type === "error") {
          const errText =
            event.message ||
            event.detail ||
            (typeof event.error_type === "string" ? event.error_type : "") ||
            "Stream error";
          error = errText;
          const rawUpstream = event.upstream_error || event.detail || null;
          messages = withUniqueMessageIds([
            ...messages,
            {
              id: event.run_id ? `${event.run_id}-error` : `stream-error-${Date.now()}`,
              role: "error",
              type: "error_message",
              content: errText,
              errorDetail: rawUpstream,
              date: event.date || new Date().toISOString(),
              collapsed: false,
            },
          ]);
        }
      }
      if (!isCurrentStream(streamId)) return;
      if (stickToBottom) await scrollToBottom();
      await loadMemory(streamAgentId);
    } catch (err) {
      if (err.name === "AbortError") return;
      if (isCurrentStream(streamId)) error = err.message;
    } finally {
      if (isCurrentStream(streamId)) {
        activeStream = null;
        streaming = false;
      }
    }
  }

  function extractText(content) {
    if (!content) return "";
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .map((p) => (typeof p === "string" ? p : p?.text || ""))
        .join("");
    }
    return "";
  }

  function onKeydown(e) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      send();
    }
  }

  function formatDate(d) {
    if (!d) return "";
    try {
      return new Date(d).toLocaleString();
    } catch {
      return d;
    }
  }

  function renderMarkdown(text) {
    try {
      const html = marked.parse(text || "");
      return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
    } catch {
      return DOMPurify.sanitize(text || "");
    }
  }
</script>

<div class="chat-layout">
  <header class="chat-header">
    <select value={agentId} onchange={onAgentChange}>
      {#each agentList as a}
        <option value={a.id}>{a.name}</option>
      {/each}
    </select>
    <button
      class="memory-btn"
      title="Memory blocks"
      onclick={() => (showMemory = !showMemory)}
    >
      memory
    </button>
  </header>

  {#if error}<p class="error">{error}</p>{/if}

  <div class="chat-body">
    {#if dropOverlay}<div class="drop-overlay">Drop image to attach</div>{/if}
    <ConversationList agentId={agentId} />
    <div class="messages" bind:this={listEl} onscroll={onMessagesScroll} ondragover={onDragOver} ondragleave={onDragLeave} ondrop={onDrop}>
      {#each displayGroups as group (group.key)}
        {#if group.type === "user" || group.type === "single"}
          {#each group.messages as msg, i (messageListKey(msg, i))}
            {@render messageArticle(msg)}
          {/each}
        {:else}
          <div class="turn-group">
            {#each group.visible as msg, i (messageListKey(msg, i))}
              {@render messageArticle(msg)}
            {/each}
            {#if group.hiddenCount > 0}
              <button
                type="button"
                class="turn-expand"
                onclick={() => toggleTurnExpand(group.key)}
              >
                {expandedTurns[group.key]
                  ? "Show fewer"
                  : `Show all (${group.total} total)`}
              </button>
              {#if expandedTurns[group.key]}
                {#each group.hidden as msg, i (messageListKey(msg, `h-${i}`))}
                  {@render messageArticle(msg)}
                {/each}
              {/if}
            {/if}
          </div>
        {/if}
      {/each}
    </div>

    {#if showMemory}
      <aside class="memory-panel">
        <h3>Memory</h3>
        {#each memoryBlocks as block}
          <div class="mem-block">
            <strong>{block.label}</strong>
            <pre>{block.value}</pre>
          </div>
        {/each}
      </aside>
    {/if}
  </div>

  <footer class="input-area">
    <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden bind:this={fileInput} onchange={onFilePick} />
    {#if pendingAttachment}
      <AttachmentThumbnail
        src={previewSrcForAttachment(pendingAttachment)}
        onRemove={clearAttachment}
        onView={() => openViewer(previewSrcForAttachment(pendingAttachment))}
      />
    {/if}
    {#if showUrlAttach}
      <div class="url-attach">
        <input type="url" bind:value={urlAttachInput} placeholder="Image URL" />
        <button type="button" onclick={attachFromUrl}>Fetch</button>
        <button type="button" class="ghost" onclick={() => (showUrlAttach = false)}>Cancel</button>
      </div>
    {/if}
    <div class="composer-row">
      <button
        type="button"
        class="attach-btn"
        title={visionCapable ? "Attach image" : "This agent's model can't see images. Switch to a vision-capable agent."}
        disabled={streaming || !visionCapable}
        onclick={() => fileInput?.click()}
      >📎</button>
      <button type="button" class="attach-btn" disabled={streaming || !visionCapable} onclick={() => (showUrlAttach = !showUrlAttach)}>URL</button>
      <textarea
        bind:value={input}
        onkeydown={onKeydown}
        onpaste={onPaste}
        placeholder="Message… (Cmd+Enter to send)"
        rows="2"
        disabled={streaming}
      ></textarea>
      <button onclick={send} disabled={streaming || (!input.trim() && !pendingAttachment)}>Send</button>
    </div>
  </footer>
  <ImageViewer src={viewerSrc} bind:open={viewerOpen} />
</div>

{#snippet messageArticle(msg)}
  <article class="msg {msg.role}">
    <div class="msg-header">
      <span class="role">{msg.role}</span>
      <span class="time">{formatDate(msg.date)}</span>
    </div>
    {#if msg.reasoning}
      <details class="reasoning">
        <summary>Reasoning</summary>
        <pre class="wrap">{msg.reasoning}</pre>
      </details>
    {/if}
    {#if msg.role === "system"}
      <div class="system-context">
        <button type="button" class="system-toggle" onclick={toggleSystemContext}>
          {msg.collapsed ? msg.systemSummary : "[hide system context]"}
        </button>
        {#if !msg.collapsed}
          <pre class="system-body">{msg.content}</pre>
        {/if}
      </div>
    {:else if msg.role === "reasoning"}
      <details class="reasoning">
        <summary>Reasoning</summary>
        {#if msg.content}
          <pre class="wrap">{msg.content}</pre>
        {/if}
      </details>
    {:else if msg.role === "tool_call" || msg.role === "tool_result"}
      {#if msg.role === "tool_result" && msg.toolDisplayImages?.length}
        <div class="tool-result-images-visible" aria-label="Tool result images">
          {#each msg.toolDisplayImages as item (item.key)}
            {#if item.url}
              <ToolResultImage url={item.url} onOpen={openViewer} />
            {:else if item.src}
              <button type="button" class="img-btn" onclick={() => openViewer(item.src)}>
                <img
                  src={item.src}
                  alt="Generated image from tool"
                  loading="lazy"
                  decoding="async"
                  referrerpolicy="no-referrer"
                  class="inline-img tool-result-img"
                />
              </button>
            {/if}
          {/each}
        </div>
      {/if}
      <details open={msg.role === "tool_result" ? false : !msg.collapsed}>
        <summary>{msg.role === "tool_call" ? "Tool call" : "Tool result"}</summary>
        {#if msg.contentBlocks?.length}
          <div class="content blocks">
            {#if msg.content}
              <pre class="wrap">{msg.content}</pre>
            {/if}
          </div>
        {:else}
          <pre class="wrap">{msg.content}</pre>
        {/if}
      </details>
    {:else if msg.role === "error"}
      <div class="content error-text">{msg.content}</div>
      {#if msg.errorDetail && msg.errorDetail !== msg.content}
        <details class="injected-context">
          <summary>Upstream error (raw)</summary>
          <pre class="wrap">{msg.errorDetail}</pre>
        </details>
      {/if}
    {:else if msg.role === "agent"}
      <div class="content md">{@html renderMarkdown(msg.content)}</div>
      {#if msg.injectedContextJson}
        <details class="injected-context">
          <summary>Provider failure record (JSON)</summary>
          <p class="injected-context-hint">
            Structured notice added to agent memory after a failed step — not the upstream SSE parse error.
          </p>
          <pre class="wrap">{msg.injectedContextJson}</pre>
        </details>
      {/if}
    {:else if msg.contentBlocks?.length}
      <div class="content blocks">
        {#if msg.content}
          <pre class="wrap">{msg.content}</pre>
        {/if}
        {#each msg.contentBlocks.filter((b) => b.type === "image") as img, i (i)}
          {@const src = imageSrcFromBlock(img)}
          {#if src}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <button type="button" class="img-btn" onclick={() => openViewer(src)}>
              <img src={src} alt="Message image" loading="lazy" decoding="async" referrerpolicy="no-referrer" class="inline-img" />
            </button>
          {/if}
        {/each}
      </div>
    {:else}
      <div class="content"><pre class="wrap">{msg.content}</pre></div>
    {/if}
  </article>
{/snippet}

<style>
  .chat-layout {
    display: flex;
    flex-direction: column;
    height: calc(100vh - 52px);
  }
  .chat-header {
    display: flex;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: #fff;
    border-bottom: 1px solid #ddd;
    align-items: center;
  }
  .chat-header select {
    flex: 1;
    max-width: 320px;
  }
  .memory-btn {
    font-size: 0.8rem;
    padding: 0.35rem 0.6rem;
    border: 1px solid #ccc;
    background: #f9f9f9;
    border-radius: 4px;
  }
  .chat-body {
    flex: 1;
    display: flex;
    overflow: hidden;
    min-height: 0;
    position: relative;
  }
  .messages {
    flex: 1;
    min-width: 0;
    overflow-y: auto;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .msg {
    background: #fff;
    border: 1px solid #e5e5e5;
    border-radius: 8px;
    padding: 0.75rem 1rem;
    max-width: 85%;
  }
  .msg.user {
    align-self: flex-end;
    background: #eff6ff;
  }
  .msg.error {
    border-left: 3px solid #c62828;
    background: #ffebee;
  }
  .error-text {
    color: #b71c1c;
    font-weight: 500;
  }
  .injected-context {
    margin-top: 0.5rem;
    font-size: 0.85rem;
  }
  .injected-context-hint {
    margin: 0.25rem 0 0.5rem;
    color: #666;
    font-size: 0.8rem;
  }
  .injected-context pre {
    max-height: 240px;
    overflow: auto;
    background: #f5f5f5;
    padding: 0.5rem;
    border-radius: 4px;
  }
  .msg.agent {
    align-self: flex-start;
    width: 100%;
    max-width: 85%;
    min-width: 0;
  }
  .msg.tool_call,
  .msg.tool_result {
    align-self: stretch;
    max-width: 100%;
    background: #fafafa;
    border-style: dashed;
  }
  .tool-result-images-visible {
    margin: 0.5rem 0 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .tool-result-img {
    max-height: 420px;
  }
  .turn-group {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .turn-expand {
    align-self: flex-start;
    background: #f3f4f6;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    padding: 0.35rem 0.65rem;
    font-size: 0.8rem;
    color: #374151;
    cursor: pointer;
  }
  .turn-expand:hover {
    background: #e5e7eb;
  }
  .msg-header {
    display: flex;
    justify-content: space-between;
    font-size: 0.75rem;
    color: #666;
    margin-bottom: 0.35rem;
  }
  .role {
    text-transform: uppercase;
    font-weight: 600;
  }
  .reasoning {
    margin-bottom: 0.5rem;
    font-size: 0.85rem;
    color: #6b7280;
    width: 100%;
    min-width: 0;
  }
  .reasoning pre {
    white-space: pre-wrap;
    word-break: normal;
    overflow-wrap: break-word;
    margin: 0.25rem 0 0;
    width: 100%;
    max-width: 100%;
    min-width: 0;
  }
  .content pre,
  pre.wrap,
  pre.system-body {
    white-space: pre-wrap;
    word-break: normal;
    overflow-wrap: break-word;
    margin: 0;
    font-size: 0.9rem;
  }
  .system-context {
    font-size: 0.85rem;
    color: #6b7280;
  }
  .system-toggle {
    background: none;
    border: none;
    padding: 0;
    color: #6b7280;
    font-size: 0.85rem;
    cursor: pointer;
    text-align: left;
  }
  .system-toggle:hover {
    text-decoration: underline;
  }
  .msg.system {
    max-width: 100%;
    align-self: stretch;
    background: #f9fafb;
    border-style: dotted;
  }
  .content.md :global(p) {
    margin: 0.25rem 0;
  }
  .memory-panel {
    width: 280px;
    border-left: 1px solid #ddd;
    background: #fff;
    padding: 1rem;
    overflow-y: auto;
  }
  .mem-block {
    margin-bottom: 1rem;
  }
  .mem-block pre {
    white-space: pre-wrap;
    font-size: 0.8rem;
    background: #f5f5f5;
    padding: 0.5rem;
    border-radius: 4px;
  }
  .drop-overlay {
    position: absolute;
    inset: 0;
    background: rgba(59, 130, 246, 0.15);
    border: 2px dashed #3b82f6;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 5;
    pointer-events: none;
    font-weight: 600;
  }
  .composer-row { display: flex; gap: 0.5rem; align-items: flex-end; width: 100%; }
  .composer-row textarea { flex: 1; }
  .attach-btn { padding: 0.35rem 0.5rem; border: 1px solid #ccc; background: #f9f9f9; border-radius: 4px; }
  .url-attach { display: flex; gap: 0.5rem; width: 100%; margin-bottom: 0.5rem; }
  .url-attach input { flex: 1; }
  .inline-img { max-width: 480px; max-height: 360px; border-radius: 6px; margin-top: 0.5rem; display: block; }
  .img-btn { padding: 0; border: none; background: none; cursor: zoom-in; }
  .input-area {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: #fff;
    border-top: 1px solid #ddd;
  }
  .input-area textarea {
    flex: 1;
    resize: none;
    padding: 0.5rem;
    border: 1px solid #ccc;
    border-radius: 4px;
  }
  .input-area button {
    padding: 0.5rem 1.25rem;
    background: #2563eb;
    color: #fff;
    border: none;
    border-radius: 4px;
  }
  .input-area button:disabled {
    opacity: 0.5;
  }
  .error {
    color: #dc2626;
    margin: 0;
    padding: 0.5rem 1rem;
  }
</style>
