// Forward every /api/* request on the Pages site to the worldwordgame Worker.
const API_ORIGIN = "https://worldwordgame.ezequielcasillas1.workers.dev";

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const target = API_ORIGIN + url.pathname + url.search;
  const init = {
    method: request.method,
    headers: request.headers,
    redirect: "manual",
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }
  return fetch(target, init);
}
