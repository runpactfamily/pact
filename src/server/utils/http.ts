import { PactError } from "../errors";

interface FetchJsonOptions {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs: number;
  provider: string;
}

/** fetch with a timeout and provider errors mapped to PactError. Never logs headers. */
export async function fetchJson<T>(url: string, options: FetchJsonOptions): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers: { accept: "application/json", ...(options.body ? { "content-type": "application/json" } : {}), ...options.headers },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    if (!response.ok) {
      const snippet = (await response.text().catch(() => "")).slice(0, 300);
      if (response.status === 429) throw new PactError("RATE_LIMITED", `${options.provider} is rate limiting requests. Try again shortly.`, { status: 429, body: snippet });
      if (response.status === 401 || response.status === 403) {
        throw new PactError("PROVIDER_UNAVAILABLE", `${options.provider} rejected the configured credentials.`, { status: response.status, body: snippet });
      }
      throw new PactError("PROVIDER_UNAVAILABLE", `${options.provider} returned an error (HTTP ${response.status}).`, { status: response.status, body: snippet });
    }
    try {
      return (await response.json()) as T;
    } catch (error) {
      throw new PactError("MALFORMED_PROVIDER_RESPONSE", `${options.provider} returned an unreadable response.`, error);
    }
  } catch (error) {
    if (error instanceof PactError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new PactError("PROVIDER_TIMEOUT", `${options.provider} did not respond in time.`);
    }
    throw new PactError("PROVIDER_UNAVAILABLE", `${options.provider} could not be reached.`, error);
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchText(url: string, options: Omit<FetchJsonOptions, "body" | "method">): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const response = await fetch(url, { headers: options.headers, signal: controller.signal });
    if (response.status === 429) throw new PactError("RATE_LIMITED", `${options.provider} is rate limiting requests. Try again shortly.`);
    if (!response.ok) throw new PactError("PROVIDER_UNAVAILABLE", `${options.provider} returned an error.`, { status: response.status });
    return await response.text();
  } catch (error) {
    if (error instanceof PactError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new PactError("PROVIDER_TIMEOUT", `${options.provider} did not respond in time.`);
    }
    throw new PactError("PROVIDER_UNAVAILABLE", `${options.provider} could not be reached.`, error);
  } finally {
    clearTimeout(timer);
  }
}

/** Only http(s) URLs with a real host are allowed near tools. */
export function assertPublicUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new PactError("INVALID_REQUEST", "That is not a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new PactError("INVALID_REQUEST", "Only http and https links are supported.");
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) ||
    host === "[::1]" ||
    host === "::1"
  ) {
    throw new PactError("INVALID_REQUEST", "Links to private or local addresses are not allowed.");
  }
  return url;
}
