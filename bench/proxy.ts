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

async function handle(req: Request): Promise<Response> {
  {
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
    // Optional: keep full request bodies for protocol inspection (never includes headers or keys).
    if (process.env.DUMP_DIR && bodyText) appendFileSync(`${process.env.DUMP_DIR}/${tag}.jsonl`, bodyText + "\n");
    const headers = new Headers(req.headers);
    headers.delete("host");
    headers.delete("content-length");
    headers.set("accept-encoding", "identity");
    const started = Date.now();
    const record = (r: object) => appendFileSync(log, JSON.stringify({ tag, path: rest.join("/"), ms: Date.now() - started, req: reqInfo, ...r }) + "\n");
    let upstream: Response;
    try {
      upstream = await fetch(target, { method: req.method, headers, body: bodyText });
    } catch (err) {
      // A dropped upstream connection must not take the proxy down; the agent sees a retryable 502.
      record({ status: 502, error: String(err) });
      return new Response(JSON.stringify({ error: { message: `upstream: ${err}` } }), { status: 502, headers: { "content-type": "application/json" } });
    }
    if (!upstream.body) return upstream;
    const [toClient, toLog] = upstream.body.tee();
    new Response(toLog)
      .text()
      .then((text) => record({ status: upstream.status, usage: usageFrom(text), error: upstream.ok ? undefined : text.slice(0, 300) }))
      .catch((err) => record({ status: upstream.status, error: `stream: ${err}` }));
    // fetch() already decoded the body; drop encoding/length headers so the client doesn't decode twice.
    const outHeaders = new Headers(upstream.headers);
    outHeaders.delete("content-encoding");
    outHeaders.delete("content-length");
    return new Response(toClient, { status: upstream.status, headers: outHeaders });
  }
}

process.on("unhandledRejection", (err) => console.error("unhandled:", err));
process.on("uncaughtException", (err) => console.error("uncaught:", err));
const onError = (err: Error) => new Response(JSON.stringify({ error: { message: `proxy: ${err.message}` } }), { status: 502 });
Bun.serve({ port, hostname: "127.0.0.1", idleTimeout: 0, fetch: handle, error: onError });
// Sandboxed agents have no network at all; they reach this proxy through a Unix socket.
if (process.env.SOCK) Bun.serve({ unix: process.env.SOCK, idleTimeout: 0, fetch: handle, error: onError });
console.log(`proxy on 127.0.0.1:${port}${process.env.SOCK ? ` and ${process.env.SOCK}` : ""} -> ${UPSTREAM}, logging to ${log}`);
