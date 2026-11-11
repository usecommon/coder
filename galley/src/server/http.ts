// Headless server: the same agent core over HTTP, with live events and approvals over SSE.
//
//   GET  /health                      -> { ok }
//   GET  /sessions                    -> list
//   POST /sessions        {mode?}     -> { id }
//   GET  /sessions/:id                -> { id, title, messages, usage, costUsd }
//   POST /sessions/:id/messages {text, mode?} -> TurnResult (waits for the turn)
//   POST /sessions/:id/abort          -> { aborted }
//   POST /sessions/:id/undo           -> { restored }
//   GET  /events                      -> SSE stream of AgentEvent and approval_request events
//   POST /approvals/:id {answer: "once"|"always"|"deny"}
import { randomBytes, timingSafeEqual } from "node:crypto";
import { Agent } from "../agent/loop.ts";
import type { Config } from "../config.ts";
import type { AgentEvent } from "../core/types.ts";
import type { ApprovalAnswer, Mode, PermissionRequest } from "../safety/permission.ts";
import { Session } from "../session/store.ts";
import type { Tool } from "../tools/types.ts";

type ServerEvent = AgentEvent | { type: "approval_request"; id: string; request: PermissionRequest };

export interface ServeOptions {
  cfg: Config;
  workspace: string;
  port: number;
  hostname: string;
  extraTools?: Tool[];
  password?: string;
}

export function serve(o: ServeOptions) {
  const agents = new Map<string, Agent>();
  const running = new Map<string, AbortController>();
  const subscribers = new Set<ReadableStreamDefaultController<Uint8Array>>();
  const pending = new Map<string, (a: ApprovalAnswer) => void>();
  const enc = new TextEncoder();

  const broadcast = (e: ServerEvent) => {
    const chunk = enc.encode(`data: ${JSON.stringify(e)}\n\n`);
    for (const s of subscribers) {
      try {
        s.enqueue(chunk);
      } catch {
        subscribers.delete(s);
      }
    }
  };

  const approver = (request: PermissionRequest) =>
    new Promise<ApprovalAnswer>((resolve) => {
      const id = randomBytes(6).toString("hex");
      const timer = setTimeout(() => {
        pending.delete(id);
        resolve("deny");
      }, 5 * 60_000);
      pending.set(id, (a) => {
        clearTimeout(timer);
        pending.delete(id);
        resolve(a);
      });
      broadcast({ type: "approval_request", id, request });
    });

  const agentFor = (id: string, mode?: Mode): Agent => {
    let a = agents.get(id);
    if (!a) {
      const session = Session.load(o.workspace, id);
      a = new Agent({ cfg: o.cfg, workspace: o.workspace, session, approver, onEvent: broadcast, extraTools: o.extraTools, model: session.meta.model });
      agents.set(id, a);
    }
    if (mode) a.mode = mode;
    return a;
  };

  const json = (data: unknown, status = 200) => Response.json(data, { status });
  const authorized = (req: Request) => {
    if (!o.password) return true;
    const got = Buffer.from(req.headers.get("authorization") ?? "");
    const want = Buffer.from(`Bearer ${o.password}`);
    return got.length === want.length && timingSafeEqual(got, want);
  };

  return Bun.serve({
    port: o.port,
    hostname: o.hostname,
    idleTimeout: 0,
    async fetch(req) {
      if (!authorized(req)) return json({ error: "unauthorized" }, 401);
      const url = new URL(req.url);
      const parts = url.pathname.split("/").filter(Boolean);
      const body = async () => (req.method === "POST" ? ((await req.json().catch(() => ({}))) as Record<string, any>) : {});
      try {
        if (req.method === "GET" && url.pathname === "/health") return json({ ok: true, workspace: o.workspace });
        if (req.method === "GET" && url.pathname === "/events") {
          let ctrl: ReadableStreamDefaultController<Uint8Array>;
          const stream = new ReadableStream<Uint8Array>({
            start(c) {
              ctrl = c;
              subscribers.add(c);
              c.enqueue(enc.encode(`data: ${JSON.stringify({ type: "connected" })}\n\n`));
            },
            cancel() {
              subscribers.delete(ctrl);
            },
          });
          return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" } });
        }
        if (parts[0] === "sessions") {
          if (parts.length === 1 && req.method === "GET") return json(Session.list(o.workspace));
          if (parts.length === 1 && req.method === "POST") {
            const b = await body();
            const s = Session.create(o.workspace, b.model ?? o.cfg.model);
            agentFor(s.id, b.mode);
            return json({ id: s.id }, 201);
          }
          const id = parts[1]!;
          if (parts.length === 2 && req.method === "GET") {
            const s = agentFor(id).session;
            return json({ id: s.id, title: s.title, messages: s.messages, usage: s.usage, costUsd: s.costUsd });
          }
          if (parts[2] === "messages" && req.method === "POST") {
            const b = await body();
            if (typeof b.text !== "string" || !b.text) return json({ error: "text is required" }, 400);
            if (running.has(id)) return json({ error: "this session is already running a turn" }, 409);
            const a = agentFor(id, b.mode);
            const ctrl = new AbortController();
            running.set(id, ctrl);
            try {
              return json(await a.send(b.text, ctrl.signal));
            } finally {
              running.delete(id);
            }
          }
          if (parts[2] === "abort" && req.method === "POST") {
            running.get(id)?.abort();
            return json({ aborted: running.has(id) });
          }
          if (parts[2] === "undo" && req.method === "POST") return json({ restored: agentFor(id).undo.undo() });
        }
        if (parts[0] === "approvals" && parts[1] && req.method === "POST") {
          const b = await body();
          const resolve = pending.get(parts[1]);
          if (!resolve) return json({ error: "no such pending approval" }, 404);
          resolve(b.answer === "always" || b.answer === "once" ? b.answer : "deny");
          return json({ ok: true });
        }
        return json({ error: "not found" }, 404);
      } catch (err) {
        return json({ error: (err as Error).message }, 500);
      }
    },
  });
}
