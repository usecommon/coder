// Logging reverse proxy for the DeepSeek API. Agents call http://127.0.0.1:<port>/<tag>/chat/completions;
// the proxy forwards to DeepSeek unchanged and records the usage DeepSeek reports, so both agents are
// measured by the same, provider-reported numbers.
import { appendFileSync } from "node:fs";

const UPSTREAM = process.env.UPSTREAM ?? "https://api.deepseek.com";
const port = Number(process.env.PORT ?? 8799);
const log = process.env.LOG ?? "proxy.jsonl";

function usageFrom(text: string): any {
  // Streaming: take the last chunk that carries usage. Non-streaming: the body's usage.
  let usage: any;
  for (const line of text.split("\n")) {
    const l = line.trim();
    if (!l.startsWith("data:")) continue;
    const d = l.slice(5).trim();
    if (d === "[DONE]") continue;
    try {
      const j = JSON.parse(d);
      if (j.usage) usage = j.usage;
    } catch {}
  }
  if (!usage) {
    try {
      usage = JSON.parse(text).usage;
    } catch {}
  }
  return usage;
}

Bun.serve({
  port,
  hostname: "127.0.0.1",
  idleTimeout: 0,
  async fetch(req) {
    const url = new URL(req.url);
    const [, tag, ...rest] = url.pathname.split("/");
    const target = `${UPSTREAM}/${rest.join("/")}${url.search}`;
    const bodyText = req.method === "POST" ? await req.text() : undefined;
    let reqInfo: any = {};
    try {
      const b = JSON.parse(bodyText ?? "{}");
      reqInfo = {
        model: b.model,
        stream: b.stream,
        messages: b.messages?.length,
        tools: b.tools?.length,
        system_chars: b.messages?.filter((m: any) => m.role === "system").reduce((n: number, m: any) => n + JSON.stringify(m.content).length, 0),
        extra: Object.keys(b).filter((k) => !["model", "messages", "tools", "stream", "stream_options"].includes(k)),
        reasoning_effort: b.reasoning_effort,
        thinking: b.thinking,
      };
    } catch {}
    const headers = new Headers(req.headers);
    headers.delete("host");
    headers.delete("content-length");
    headers.set("accept-encoding", "identity");
    const started = Date.now();
    const upstream = await fetch(target, { method: req.method, headers, body: bodyText });
    if (!upstream.body) return upstream;
    const [toClient, toLog] = upstream.body.tee();
    (async () => {
      const text = await new Response(toLog).text();
      appendFileSync(log, JSON.stringify({ tag, path: rest.join("/"), status: upstream.status, ms: Date.now() - started, req: reqInfo, usage: usageFrom(text), error: upstream.ok ? undefined : text.slice(0, 300) }) + "\n");
    })();
    // fetch() already decoded the body; drop encoding/length headers so the client doesn't decode twice.
    const outHeaders = new Headers(upstream.headers);
    outHeaders.delete("content-encoding");
    outHeaders.delete("content-length");
    return new Response(toClient, { status: upstream.status, headers: outHeaders });
  },
});
console.log(`proxy on 127.0.0.1:${port} -> ${UPSTREAM}, logging to ${log}`);
