// Runs inside an agent's network-less sandbox: serves 127.0.0.1:<PORT> and relays every request
// to the host's logging proxy over a bind-mounted Unix socket. Nothing else is reachable.
const sock = process.env.PROXY_SOCK!;
Bun.serve({
  port: Number(process.env.PORT ?? 8799),
  hostname: "127.0.0.1",
  idleTimeout: 0,
  async fetch(req) {
    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.arrayBuffer() : undefined;
    const res = await fetch(`http://proxy${url.pathname}${url.search}`, { method: req.method, headers: req.headers, body, unix: sock } as RequestInit);
    return new Response(res.body, { status: res.status, headers: res.headers });
  },
});
