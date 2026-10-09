import { PactError } from "../errors";
import type { Providers } from "../providers/types";
import { calculatorTool } from "./calculator";
import { dataAnalyzeTool } from "./dataAnalyze";
import { fileReadTool } from "./fileRead";
import { githubTool } from "./github";
import type { JsonSchema, Tool, ToolAvailability } from "./types";

// Tools are stored erased: each one declares its own input type, and the
// registry validates raw input against the declared schema before a call.
export type AnyTool = Tool<any, any>;
import { webCrawlTool } from "./webCrawl";
import { webReadTool } from "./webRead";
import { webSearchTool } from "./webSearch";
import { ONCHAIN_TOOLS } from "./onchain/index";

export interface ToolListing {
  name: string;
  description: string;
  stage: Tool["stage"];
  planned: boolean;
  availability: ToolAvailability;
}

// Tools that exist as names today so plans, docs and the UI can refer to them.
// They are not executable until implemented.
const PLANNED: { name: string; description: string; stage: Tool["stage"] }[] = [
  { name: "document_search", description: "Find passages across uploaded documents.", stage: "analyzing" },
  { name: "vector_search", description: "Semantic search over the user's library.", stage: "researching" },
  { name: "email", description: "Read or draft email on the user's behalf.", stage: "working" },
  { name: "drive", description: "Read files from connected cloud storage.", stage: "understanding" },
  { name: "calendar", description: "Read the user's calendar.", stage: "understanding" },
  { name: "generate_report", description: "Render a result as a downloadable document.", stage: "working" },
];

export class ToolRegistry {
  private readonly tools = new Map<string, AnyTool>();

  register(tool: AnyTool) {
    if (this.tools.has(tool.name)) throw new Error(`Tool already registered: ${tool.name}`);
    this.tools.set(tool.name, tool);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  get(name: string): AnyTool {
    const tool = this.tools.get(name);
    if (!tool) throw new PactError("INVALID_REQUEST", `Unknown tool: ${name}`);
    return tool;
  }

  names(): string[] {
    return [...this.tools.keys()];
  }

  list(providers: Providers): ToolListing[] {
    const live = [...this.tools.values()].map((tool) => ({
      name: tool.name,
      description: tool.description,
      stage: tool.stage,
      planned: false,
      availability: tool.isAvailable(providers),
    }));
    const planned = PLANNED.map((p) => ({ ...p, planned: true, availability: { available: false, reason: "Planned for a later phase" } }));
    return [...live, ...planned];
  }

  /** Validates input against the tool's declared schema. Unknown keys are dropped. */
  validateInput(name: string, input: unknown): Record<string, unknown> {
    const tool = this.get(name);
    return validateAgainst(tool.inputSchema, input, name);
  }
}

export function validateAgainst(schema: JsonSchema, input: unknown, label: string): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new PactError("INVALID_REQUEST", `${label}: input must be an object.`);
  }
  const source = input as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, spec] of Object.entries(schema.properties)) {
    const value = source[key];
    if (value === undefined || value === null) continue;
    const ok =
      (spec.type === "string" && typeof value === "string") ||
      (spec.type === "number" && typeof value === "number" && Number.isFinite(value)) ||
      (spec.type === "boolean" && typeof value === "boolean") ||
      (spec.type === "array" && Array.isArray(value));
    if (!ok) throw new PactError("INVALID_REQUEST", `${label}: "${key}" must be a ${spec.type}.`);
    if (spec.enum && !spec.enum.includes(value as string)) throw new PactError("INVALID_REQUEST", `${label}: "${key}" must be one of ${spec.enum.join(", ")}.`);
    out[key] = value;
  }
  for (const key of schema.required ?? []) {
    if (out[key] === undefined) throw new PactError("INVALID_REQUEST", `${label}: "${key}" is required.`);
  }
  return out;
}

export function createDefaultRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(calculatorTool);
  registry.register(webSearchTool);
  registry.register(webReadTool);
  registry.register(githubTool);
  registry.register(fileReadTool);
  registry.register(dataAnalyzeTool);
  registry.register(webCrawlTool);
  return registry;
}

/** The onchain surface: the general tools plus the chain tools. Never used for runs from /app. */
export function createOnchainRegistry(): ToolRegistry {
  const registry = createDefaultRegistry();
  for (const tool of ONCHAIN_TOOLS) registry.register(tool);
  return registry;
}

export type RunSurface = "app" | "onchain";

const shared: Partial<Record<RunSurface, ToolRegistry>> = {};

export function getRegistry(surface: RunSurface = "app"): ToolRegistry {
  return (shared[surface] ??= surface === "onchain" ? createOnchainRegistry() : createDefaultRegistry());
}
