// Development identity. There are no accounts yet: the client sends a stable,
// self-generated id in a header (or, for EventSource which cannot set
// headers, a query parameter), and the server scopes runs and files to it.
// Replace getUserId() with a real session lookup when authentication lands;
// nothing else needs to change.

const DEV_USER = "dev-user";
const SAFE = /^[A-Za-z0-9_-]{4,64}$/;

export function getUserId(request: Request): string {
  const header = request.headers.get("x-pact-user")?.trim();
  if (header && SAFE.test(header)) return header;
  const param = new URL(request.url).searchParams.get("user")?.trim();
  if (param && SAFE.test(param)) return param;
  return DEV_USER;
}
