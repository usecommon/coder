import type { Config } from "../config.ts";
import { AnthropicProvider } from "./anthropic.ts";
import { MockProvider } from "./mock.ts";
import { OpenAICompatProvider } from "./openai-compat.ts";
import type { Provider } from "./types.ts";

/** Built-in OpenAI-compatible presets. Add your own under `providers` in galley.json. */
export const PRESETS: Record<string, { baseURL: string; apiKeyEnv?: string; sendReasoning?: boolean; reasoningEffort?: string; effortMap?: Record<string, string> }> = {
  openai: { baseURL: "https://api.openai.com/v1", apiKeyEnv: "OPENAI_API_KEY" },
  // DeepSeek's thinking mode expects earlier reasoning to be sent back while tools are in use. Measured over
  // three benchmark rounds it changed neither pass rate nor cost (bench/RESULTS-clean.md).
  // Its `reasoning_effort` takes low, high (the default) and max. Only "low" is passed on: at Galley's other levels
  // the API's default stays in force, which is what the benchmark rounds measured.
  deepseek: { baseURL: "https://api.deepseek.com", apiKeyEnv: "DEEPSEEK_API_KEY", sendReasoning: true, effortMap: { low: "low" } },
  openrouter: { baseURL: "https://openrouter.ai/api/v1", apiKeyEnv: "OPENROUTER_API_KEY" },
  qwen: { baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", apiKeyEnv: "DASHSCOPE_API_KEY" },
  moonshot: { baseURL: "https://api.moonshot.ai/v1", apiKeyEnv: "MOONSHOT_API_KEY" },
  zai: { baseURL: "https://api.z.ai/api/paas/v4", apiKeyEnv: "ZAI_API_KEY" },
  groq: { baseURL: "https://api.groq.com/openai/v1", apiKeyEnv: "GROQ_API_KEY" },
  ollama: { baseURL: "http://localhost:11434/v1" },
  vllm: { baseURL: "http://localhost:8000/v1" },
};

export function splitModel(ref: string): { provider: string; model: string } {
  const i = ref.indexOf("/");
  if (i <= 0) throw new Error(`Model "${ref}" must look like provider/model, e.g. anthropic/claude-opus-5-5`);
  return { provider: ref.slice(0, i), model: ref.slice(i + 1) };
}

/** Options for an OpenAI-compatible provider: the user's settings in galley.json over the built-in preset. */
export function compatOptions(id: string, cfg: Config) {
  const pc = cfg.providers[id] ?? {};
  const preset = PRESETS[id];
  const baseURL = pc.baseURL ?? preset?.baseURL;
  if (!baseURL) throw new Error(`Unknown provider "${id}". Add it under "providers" in galley.json with a baseURL.`);
  const keyEnv = pc.apiKeyEnv ?? preset?.apiKeyEnv;
  return {
    id,
    baseURL,
    apiKey: keyEnv ? process.env[keyEnv] : undefined,
    headers: pc.headers,
    sendReasoning: pc.sendReasoning ?? preset?.sendReasoning,
    reasoningEffort: pc.reasoningEffort ?? preset?.reasoningEffort,
    effortMap: preset?.effortMap,
    includeUsage: pc.includeUsage,
  };
}

const cache = new Map<string, Provider>();

export function getProvider(id: string, cfg: Config): Provider {
  const hit = cache.get(id);
  if (hit) return hit;
  const pc = cfg.providers[id] ?? {};
  let p: Provider;
  if (id === "anthropic") {
    p = new AnthropicProvider({ baseURL: pc.baseURL, apiKey: pc.apiKeyEnv ? process.env[pc.apiKeyEnv] : undefined });
  } else if (id === "mock") {
    p = new MockProvider(() => ({ text: "This is the mock provider. Set a real model with --model provider/model." }));
  } else {
    p = new OpenAICompatProvider(compatOptions(id, cfg));
  }
  cache.set(id, p);
  return p;
}

/** Register a provider instance directly (used by tests and embedders). */
export function registerProvider(p: Provider): void {
  cache.set(p.id, p);
}
