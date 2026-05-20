/** @param {string} transport */
export function transportLabel(transport) {
  if (transport === "stdio") return "Stdio";
  if (transport === "sse") return "SSE";
  if (transport === "streamable_http") return "Streamable HTTP";
  return transport || "—";
}

/** @param {Record<string, unknown>} server */
export function serverEndpointSummary(server) {
  const t = server.mcp_server_type;
  if (t === "stdio") {
    const args = (server.args || []).join(" ");
    return `${server.command || ""} ${args}`.trim();
  }
  return server.server_url || "—";
}

/** @param {unknown[]} allTools @param {string} serverName */
export function toolsForMcpServer(allTools, serverName) {
  const tag = `mcp:${serverName}`;
  return allTools.filter((t) => (t.tags || []).includes(tag));
}

/** @param {string} text */
export function parseArgsList(text) {
  return text
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** @param {string[]} args */
export function formatArgsList(args) {
  return (args || []).join("\n");
}

/** @param {string} type */
export function emptyMcpForm(type = "sse") {
  return {
    server_name: "",
    mcp_server_type: type,
    server_url: "",
    auth_header: "",
    auth_token: "",
    custom_headers_json: "",
    command: "",
    args_text: "",
    env_json: "",
  };
}

/** @param {Record<string, unknown>} server */
export function serverToForm(server) {
  const base = {
    server_name: server.server_name || "",
    mcp_server_type: server.mcp_server_type || "sse",
    server_url: server.server_url || "",
    auth_header: server.auth_header || "",
    auth_token: server.auth_token || "",
    custom_headers_json: server.custom_headers
      ? JSON.stringify(server.custom_headers, null, 2)
      : "",
    command: server.command || "",
    args_text: formatArgsList(server.args),
    env_json: server.env ? JSON.stringify(server.env, null, 2) : "",
  };
  return base;
}

/** @param {ReturnType<typeof emptyMcpForm>} form */
export function formToCreatePayload(form) {
  const t = form.mcp_server_type;
  if (t === "stdio") {
    let env = undefined;
    if (form.env_json.trim()) {
      env = JSON.parse(form.env_json);
    }
    return {
      server_name: form.server_name.trim(),
      config: {
        mcp_server_type: "stdio",
        command: form.command.trim(),
        args: parseArgsList(form.args_text),
        env,
      },
    };
  }
  let custom_headers = undefined;
  if (form.custom_headers_json.trim()) {
    custom_headers = JSON.parse(form.custom_headers_json);
  }
  const remote = {
    mcp_server_type: t,
    server_url: form.server_url.trim(),
    auth_header: form.auth_header.trim() || undefined,
    auth_token: form.auth_token.trim() || undefined,
    custom_headers,
  };
  return { server_name: form.server_name.trim(), config: remote };
}
