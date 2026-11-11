import { mkdtempSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG, type Config } from "../src/config.ts";

export function tempDir(prefix = "galley-test-"): string {
  return realpathSync(mkdtempSync(join(tmpdir(), prefix)));
}

process.env.GALLEY_DATA_DIR = tempDir("galley-data-");

export function testConfig(over: Partial<Config> = {}): Config {
  return { ...structuredClone(DEFAULT_CONFIG), model: "mock/test", verify: false, ...over };
}

/** Build a fetch that answers every request with the given SSE events. */
export function sseFetch(events: unknown[], capture?: { bodies: any[] }, extraLines: string[] = []): typeof fetch {
  return (async (_url: unknown, init?: RequestInit) => {
    if (capture && init?.body) capture.bodies.push(JSON.parse(String(init.body)));
    const text = events.map((e) => (typeof e === "string" ? e : `data: ${JSON.stringify(e)}\n\n`)).join("") + extraLines.join("");
    return new Response(text, { status: 200, headers: { "content-type": "text/event-stream" } });
  }) as unknown as typeof fetch;
}
