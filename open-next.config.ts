import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// No incremental cache: every page that needs data is dynamic and reads from
// the API; the marketing pages are static assets.
export default defineCloudflareConfig({});
