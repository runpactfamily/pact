// Worker entry: the Next.js app built by OpenNext plus the Durable Object
// that executes runs. Referenced by `main` in wrangler.jsonc.
import handler from "../../.open-next/worker.js";

export { RunExecutor } from "./executor";

const worker = {
  fetch: handler.fetch,
};

export default worker;
