export default {
  fetch() {
    return new Response("This earlier Parrot English application is offline.\n", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  },
};
