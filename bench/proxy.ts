// Logging reverse proxy for the model API. Agents call http://127.0.0.1:<port>/<tag>/chat/completions (or
// /<tag>/v1/messages); the proxy forwards the request and records the usage the provider reports, so all
// agents are measured by the same, provider-reported numbers.
//
// It also keeps the real API key out of the agents' sandboxes: agents send a placeholder, and the proxy
// replaces it with UPSTREAM_KEY. Leave UPSTREAM_KEY unset when the machine's own network layer adds the key.
//
// It serves the model's chat endpoint only, and (with ALLOW_MODELS set, as round.sh does) only the benchmark's
// model. An agent can find this proxy from inside its sandbox. Before 14 November 2026 it forwarded anything: an
// agent listed the account's models and put its questions to a stronger one.
import { appendFileSync } from "node:fs";

const UPSTREAM = process.env.UPSTREAM ?? "https://api.deepseek.com";
const UPSTREAM_KEY = process.env.UPSTREAM_KEY || undefined;
// A TCP port is only needed for agents that share the host's network. Sandboxed agents use the socket.
const port = process.env.PORT ? Number(process.env.PORT) : undefined;
const log = process.env.LOG ?? "proxy.jsonl";
const ALLOW_MODELS = (process.env.ALLOW_MODELS ?? "").split(",").map((m) => m.trim()).filter(Boolean);
const ALLOW_PATHS = new Set(["chat/completions", "v1/chat/completions", "v1/messages"]);

function usageFrom(text: string): any {
  // OpenAI-style streams: the last chunk carrying usage. Anthropic streams: usage from message_start
  // (input and cache counts), updated by message_delta (cumulative output). Non-streaming: the body's usage.
  let usage: any;
  for (const line of text.split("\n")) {
    const l = line.trim();
    if (!l.startsWith("data:")) continue;
    const d = l.slice(5).trim();
    if (d === "[DONE]") continue;
    try {
      const j = JSON.parse(d);
      if (j.type === "message_start" && j.message?.usage) usage = { ...j.message.usage };
      else if (j.type === "message_delta" && j.usage) usage = { ...usage, ...Object.fromEntries(Object.entries(j.usage).filter(([, v]) => v != null)) };
      else if (j.usage) usage = j.usage;
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
        effort: b.output_config?.effort,
        // how many earlier assistant messages carry their reasoning back to the model
        reasoning_msgs: b.messages?.filter((m: any) => m.role === "assistant" && typeof m.reasoning_content === "string" && m.reasoning_content.length > 0).length,
      };
    } catch {}
    // Optional: keep full request bodies for protocol inspection (never includes headers or keys).
    if (process.env.DUMP_DIR && bodyText) appendFileSync(`${process.env.DUMP_DIR}/${tag}.jsonl`, bodyText + "\n");
    const headers = new Headers(req.headers);
    headers.delete("host");
    headers.delete("content-length");
    headers.set("accept-encoding", "identity");
    if (UPSTREAM_KEY) {
      // Put the real key where the client put its placeholder (Anthropic clients use x-api-key or a bearer token).
      const hadApiKey = headers.has("x-api-key");
      if (hadApiKey) headers.set("x-api-key", UPSTREAM_KEY);
      if (headers.has("authorization") || !hadApiKey) headers.set("authorization", `Bearer ${UPSTREAM_KEY}`);
    }
    const started = Date.now();
    const record = (r: object) => appendFileSync(log, JSON.stringify({ tag, path: rest.join("/"), t: started, ms: Date.now() - started, req: reqInfo, ...r }) + "\n");
    // Refused here, never forwarded: anything but a chat request, and any model but the benchmark's.
    const refuse = (blocked: string, message: string) => {
      record({ status: 403, blocked });
      return new Response(JSON.stringify({ error: { message, type: "benchmark_proxy" } }), { status: 403, headers: { "content-type": "application/json" } });
    };
    if (req.method !== "POST" || !ALLOW_PATHS.has(rest.join("/"))) return refuse("endpoint", "this proxy serves the model's chat endpoint only");
    if (ALLOW_MODELS.length && !ALLOW_MODELS.includes(reqInfo.model)) return refuse("model", `this proxy serves only: ${ALLOW_MODELS.join(", ")}`);
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
if (port !== undefined) Bun.serve({ port, hostname: "127.0.0.1", idleTimeout: 0, fetch: handle, error: onError });
// Sandboxed agents have no network at all; they reach this proxy through a Unix socket.
if (process.env.SOCK) Bun.serve({ unix: process.env.SOCK, idleTimeout: 0, fetch: handle, error: onError });
if (port === undefined && !process.env.SOCK) throw new Error("set PORT or SOCK");
console.log(`proxy on ${[port !== undefined ? `127.0.0.1:${port}` : "", process.env.SOCK ?? ""].filter(Boolean).join(" and ")} -> ${UPSTREAM}, key ${UPSTREAM_KEY ? "added here" : "left to the network layer"}, logging to ${log}`);
