/** Provider types commonly used for BYOK (OpenAI-compatible gateways use `openai`). */
export const BYOK_PROVIDER_TYPES = [
  { value: "openai", label: "OpenAI-compatible" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "anthropic", label: "Anthropic" },
  { value: "groq", label: "Groq" },
  { value: "deepseek", label: "DeepSeek" },
  { value: "xai", label: "xAI" },
  { value: "together", label: "Together" },
  { value: "azure", label: "Azure OpenAI" },
  { value: "google_ai", label: "Google AI (Gemini)" },
  { value: "bedrock", label: "AWS Bedrock" },
  { value: "ollama", label: "Ollama" },
  { value: "vllm", label: "vLLM" },
  { value: "sglang", label: "SGLang" },
];

/** Env vars for built-in (base) providers configured at server deploy time. */
export const BASE_ENV_HINTS = {
  openrouter: ["OPENROUTER_API_KEY", "OPENROUTER_TITLE", "OPENROUTER_REFERER"],
  openai: ["OPENAI_API_KEY", "OPENAI_BASE_URL"],
  anthropic: ["ANTHROPIC_API_KEY"],
  ollama: ["OLLAMA_BASE_URL"],
  vllm: ["VLLM_API_BASE"],
  sglang: ["SGLANG_API_BASE"],
  groq: ["GROQ_API_KEY"],
  together: ["TOGETHER_API_KEY"],
  deepseek: ["DEEPSEEK_API_KEY"],
  xai: ["XAI_API_KEY"],
  gemini: ["GEMINI_API_KEY"],
  google_ai: ["GEMINI_API_KEY"],
  google_vertex: ["GOOGLE_CLOUD_PROJECT", "GOOGLE_CLOUD_LOCATION"],
  azure: ["AZURE_API_KEY", "AZURE_BASE_URL", "AZURE_API_VERSION"],
  bedrock: ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_DEFAULT_REGION"],
  letta: ["(Letta hosted — no extra env)"],
};

export function emptyProviderForm() {
  return {
    name: "",
    provider_type: "openai",
    api_key: "",
    access_key: "",
    region: "",
    base_url: "https://api.siliconflow.com/v1",
    api_version: "",
  };
}

export function providerToForm(provider) {
  return {
    name: provider?.name ?? "",
    provider_type: provider?.provider_type ?? "openai",
    api_key: "",
    access_key: "",
    region: provider?.region ?? "",
    base_url: provider?.base_url ?? "",
    api_version: provider?.api_version ?? "",
  };
}

export function formToCreatePayload(form) {
  const payload = {
    name: form.name.trim(),
    provider_type: form.provider_type,
    api_key: form.api_key.trim(),
  };
  if (form.access_key?.trim()) payload.access_key = form.access_key.trim();
  if (form.region?.trim()) payload.region = form.region.trim();
  if (form.base_url?.trim()) payload.base_url = form.base_url.trim();
  if (form.api_version?.trim()) payload.api_version = form.api_version.trim();
  return payload;
}

export function formToUpdatePayload(form) {
  const payload = { api_key: form.api_key.trim() };
  if (form.access_key?.trim()) payload.access_key = form.access_key.trim();
  if (form.region?.trim()) payload.region = form.region.trim();
  if (form.base_url?.trim()) payload.base_url = form.base_url.trim();
  else payload.base_url = null;
  if (form.api_version?.trim()) payload.api_version = form.api_version.trim();
  return payload;
}

export function formToCheckPayload(form) {
  return formToCreatePayload(form);
}

export function providerTypeLabel(type) {
  const row = BYOK_PROVIDER_TYPES.find((t) => t.value === type);
  return row?.label ?? type ?? "—";
}

export function categoryLabel(category) {
  if (category === "base") return "Built-in";
  if (category === "byok") return "BYOK";
  return category ?? "—";
}

export function isBaseProvider(provider) {
  return provider?.provider_category === "base";
}

export function envHintsForProvider(provider) {
  const name = provider?.name;
  const type = provider?.provider_type;
  return BASE_ENV_HINTS[name] ?? BASE_ENV_HINTS[type] ?? ["See letta-vision-deploy .env / docker-compose"];
}

export function formatSyncedAt(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
