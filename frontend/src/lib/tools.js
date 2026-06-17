/** Tool names pre-checked when creating a new agent. */
export const DEFAULT_TOOL_NAMES = [
  "send_message",
  "memory",
  "search_all",
  "image_fetch",
  "image_get_text",
  "image_edit_text",
  "image_search",
  "conversation_search",
  "archival_memory_insert",
  "archival_memory_search",
  "file_notes_search",
  "file_contents_search",
  "web_search",
  "fetch_webpage",
  "run_code",
];

/**
 * Still registered on the server for legacy/voice agents; omitted from grouped UI.
 * If attached, they appear under "Other".
 */
export const LEGACY_MEMORY_TOOL_NAMES = [
  "memory_insert",
  "memory_replace",
  "memory_rethink",
  "memory_apply_patch",
  "core_memory_append",
  "core_memory_replace",
  "memory_finish_edits",
  "rethink_user_memory",
  "finish_rethinking_memory",
  "search_memory",
  "store_memories",
  "recall",
  "write_file_archive",
  "file_archives_search",
  "search_file_contents",
  "search_archives",
];

/** Grouped tool catalog (v0.3). Unknown tools fall into "Other". */
export const TOOL_GROUPS = [
  {
    id: "communication",
    label: "Communication",
    tools: [
      "send_message",
      "send_message_to_agent_async",
      "send_message_to_agent_and_wait_for_reply",
      "send_message_to_agents_matching_tags",
    ],
  },
  {
    id: "memory",
    label: "Memory",
    tools: ["memory", "archival_memory_insert", "archival_memory_search"],
  },
  {
    id: "conversations",
    label: "Conversations",
    tools: ["conversation_search", "search_all"],
  },
  {
    id: "images",
    label: "Images",
    tools: ["image_fetch", "image_get_text", "image_edit_text", "image_search", "fetch_image"],
  },
  {
    id: "file-access",
    label: "File Access and Search",
    tools: [
      "file_add",
      "file_edit_text",
      "write_file_note",
      "file_notes_search",
      "update_file_headline",
      "file_contents_search",
      "open_file",
      "close_file",
      "file_read_page",
      "file_read_next_page",
      "file_read_prev_page",
      "file_read_range",
      "file_grep",
      "attach_folder",
      "detach_folder",
    ],
  },
  {
    id: "web",
    label: "Web",
    tools: ["web_search", "fetch_webpage"],
  },
  {
    id: "code",
    label: "Code",
    tools: ["run_code", "run_code_with_tools"],
  },
];

const GROUPED_NAMES = new Set(TOOL_GROUPS.flatMap((g) => g.tools));

export function defaultToolIds(allTools) {
  const want = new Set(DEFAULT_TOOL_NAMES);
  return allTools.filter((t) => want.has(t.name)).map((t) => t.id);
}

/** Group tools tagged mcp:{server_name} by server. */
export function buildMcpToolSections(allTools) {
  const mcpTools = allTools.filter((t) =>
    (t.tags || []).some((tag) => String(tag).startsWith("mcp:")),
  );
  if (!mcpTools.length) return [];

  const byServer = new Map();
  for (const tool of mcpTools) {
    const tag = (tool.tags || []).find((t) => String(t).startsWith("mcp:"));
    const server = tag ? String(tag).slice(4) : "unknown";
    if (!byServer.has(server)) byServer.set(server, []);
    byServer.get(server).push(tool);
  }

  return [...byServer.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([server, tools]) => ({
      id: `mcp-${server}`,
      label: `MCP: ${server}`,
      tools: tools.sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    }));
}

export function buildToolSections(allTools) {
  const byName = new Map(allTools.map((t) => [t.name, t]));
  const used = new Set();

  const mcpSections = buildMcpToolSections(allTools);
  mcpSections.forEach((s) => s.tools.forEach((t) => used.add(t.name)));

  const sections = TOOL_GROUPS.map((group) => {
    const tools = group.tools
      .map((name) => byName.get(name))
      .filter(Boolean);
    tools.forEach((t) => used.add(t.name));
    return { ...group, tools };
  });

  const other = allTools.filter((t) => !used.has(t.name));
  if (other.length) {
    sections.push({
      id: "other",
      label: "Other",
      tools: other.sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    });
  }

  return [...mcpSections, ...sections];
}

export function filterByQuery(items, query, labelFn = (x) => x) {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((item) => labelFn(item).toLowerCase().includes(q));
}
