import type { Config } from "../config.ts";
import { AnthropicProvider } from "./anthropic.ts";
import { MockProvider } from "./mock.ts";
import { OpenAICompatProvider } from "./openai-compat.ts";
import type { Provider } from "./types.ts";

/** Built-in OpenAI-compatible presets. Add your own under `providers` in galley.json. */
export const PRESETS: Record<string, { baseURL: string; apiKeyEnv?: string }> = {
  openai: { baseURL: "https://api.openai.com/v1", apiKeyEnv: "OPENAI_API_KEY" },
  deepseek: { baseURL: "https://api.deepseek.com", apiKeyEnv: "DEEPSEEK_API_KEY" },
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
    const preset = PRESETS[id];
    const baseURL = pc.baseURL ?? preset?.baseURL;
    if (!baseURL) throw new Error(`Unknown provider "${id}". Add it under "providers" in galley.json with a baseURL.`);
    const keyEnv = pc.apiKeyEnv ?? preset?.apiKeyEnv;
    p = new OpenAICompatProvider({
      id,
      baseURL,
      apiKey: keyEnv ? process.env[keyEnv] : undefined,
      headers: pc.headers,
      sendReasoning: pc.sendReasoning,
      includeUsage: pc.includeUsage,
    });
  }
  cache.set(id, p);
  return p;
}

/** Register a provider instance directly (used by tests and embedders). */
export function registerProvider(p: Provider): void {
  cache.set(p.id, p);
}
