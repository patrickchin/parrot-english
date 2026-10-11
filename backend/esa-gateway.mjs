export default {
  async fetch(request, _context, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return new Response("Not found", { status: 404 });
    if (!env.PARROT_BACKEND_URL || !env.PARROT_EDGE_SECRET) {
      return Response.json({ error: "backend_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    const backend = new URL(env.PARROT_BACKEND_URL);
    if (backend.protocol !== "https:" || !backend.hostname.endsWith(".cn-hangzhou.fcapp.run") || backend.username || backend.password) {
      return Response.json({ error: "backend_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    // ESA injects this header at its edge; verify spoof protection in staging.
    const clientIp = request.headers.get("Ali-Cdn-Real-Ip");
    if (!clientIp) return Response.json({ error: "backend_unavailable" }, { status: 503 });
    const headers = new Headers(request.headers);
    headers.set("x-parrot-edge-secret", env.PARROT_EDGE_SECRET);
    headers.set("x-parrot-original-path", url.pathname + url.search);
    headers.delete("x-forwarded-host");
    headers.delete("x-forwarded-proto");
    headers.delete("x-forwarded-for");
    headers.set("cf-connecting-ip", clientIp);
    headers.delete("host");
    try {
      const response = await fetch(backend, { method: request.method, headers, body: request.body, duplex: "half", redirect: "manual" });
      const outputHeaders = new Headers(response.headers);
      outputHeaders.delete("content-disposition");
      outputHeaders.set("Cache-Control", "private, no-store");
      return new Response(response.body, { status: response.status, headers: outputHeaders });
    } catch {
      return Response.json({ error: "backend_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
  },
};
