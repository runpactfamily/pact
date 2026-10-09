import { getConfig } from "../config";
import { isPactError, PactError, toClientError } from "../errors";
import { log } from "../log";
import type { FailoverInfo, LLMResolution } from "../providers/types";
import type { RunDeps, RunHandle } from "../runs/manager";
import type { SourceRecord } from "../runs/types";
import type { Evidence, ToolContext } from "../tools/types";
import { modelDisplay } from "@/lib/pact/models";
import { buildContext, type JobContext } from "./context";
import { mergePlans, planFromRules, planWithModel, type PlanStep } from "./planner";
import { synthesizeWithModel, type SynthesisNotes } from "./synthesizer";
import { OUTPUT_TOKENS, routeTask } from "./taskRouter";
import type { RunResult } from "@/lib/pact/types";

// The agent loop: understand → route → plan → execute tools → evaluate →
// synthesize. Hard limits on steps and tool calls are enforced here, not in
// the planner. Only high-level activity is emitted; prompts and model output
// stay here. Nothing is simulated: a provider that fails is a failed step or
// a failed run, never a made-up result.

/** Keeps tool inputs small and free of document bodies before they are stored. */
function sanitizeInput(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    out[k] = typeof v === "string" ? v.slice(0, 300) : typeof v === "number" || typeof v === "boolean" ? v : Array.isArray(v) ? v.length : typeof v;
  }
  return out;
}

/** Only counts, names and sizes from a tool's data are kept on the record. */
function metaOf(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    if (typeof v === "number" || typeof v === "boolean") out[k] = v;
    else if (typeof v === "string") out[k] = v.slice(0, 200);
    else if (Array.isArray(v)) out[`${k}Count`] = v.length;
  }
  return out;
}

function sourcesOf(evidence: Evidence[]): SourceRecord[] {
  const now = new Date().toISOString();
  return evidence
    .filter((e): e is Evidence & { kind: "search" | "page" | "repo" | "chain" } => e.kind === "search" || e.kind === "page" || e.kind === "repo" || e.kind === "chain")
    .map((e) => ({ title: e.label, url: e.url, provider: e.provider ?? "unknown", kind: e.kind, retrievedAt: now, publishedAt: e.publishedAt }));
}

function failoverLine(info: FailoverInfo): string {
  const from = modelDisplay(info.from) ?? info.from.vendor;
  const why = info.code === "RATE_LIMITED" ? "is temporarily rate-limited" : info.code === "PROVIDER_TIMEOUT" ? "did not respond in time" : "is unavailable";
  return info.to ? `${from} ${why}. Trying ${modelDisplay(info.to) ?? info.to.vendor}.` : `${from} ${why}.`;
}

/** Executes one tool step with a timeout, recording the call. Returns evidence, or [] on failure. */
async function executeStep(step: PlanStep, handle: RunHandle, deps: RunDeps, notes: SynthesisNotes): Promise<Evidence[]> {
  const { registry, providers } = deps;
  const config = getConfig();
  const tool = registry.get(step.tool);
  const record = await handle.beginStep("tool", step.label, tool.stage, { tool: step.tool, ...sanitizeInput(step.input) });

  const availability = tool.isAvailable(providers);
  if (!availability.available) {
    notes.unavailable.push({ tool: step.tool, reason: availability.reason ?? "unavailable" });
    await handle.activity(`Skipped ${step.label.toLowerCase()}: ${availability.reason ?? "tool unavailable"}`);
    await handle.endStep(record, "skipped", { reason: availability.reason }, new PactError("PROVIDER_UNAVAILABLE", availability.reason ?? "Tool unavailable."));
    return [];
  }

  const input = registry.validateInput(step.tool, step.input);
  const call = handle.beginToolCall(record.id, step.tool, sanitizeInput(input));
  await handle.activity(step.label);

  const context: ToolContext = { runId: handle.run.id, userId: handle.run.userId, providers, signal: handle.signal, timeoutMs: config.limits.toolTimeoutMs };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new PactError("PROVIDER_TIMEOUT", `${step.tool} took too long and was stopped.`)), config.limits.toolTimeoutMs + 2_000);
  });

  try {
    const output = await Promise.race([tool.execute(input, context), timeout]).finally(() => clearTimeout(timer));
    handle.throwIfCancelled();
    const meta = { summary: output.summary, evidence: output.evidence?.length ?? 0, ...metaOf(output.data) };
    await handle.endToolCall(call, meta);
    await handle.endStep(record, "completed", meta);
    await handle.activity(output.summary);
    handle.addSources(sourcesOf(output.evidence ?? []));
    return output.evidence ?? [];
  } catch (error) {
    if (isPactError(error, "RUN_CANCELLED") || handle.signal.aborted) throw error;
    const client = toClientError(error);
    notes.failures.push({ tool: step.tool, message: client.message });
    await handle.endToolCall(call, undefined, error);
    await handle.endStep(record, "failed", undefined, error);
    await handle.activity(`${step.label} failed: ${client.message}`);
    log.warn("agent.step_failed", { runId: handle.run.id, tool: step.tool, code: client.code });
    return [];
  }
}

export async function runAgent(handle: RunHandle, deps: RunDeps): Promise<RunResult> {
  const config = getConfig();
  const { providers, registry } = deps;
  const run = handle.run;
  const notes: SynthesisNotes = { unavailable: [], failures: [], stepsSkippedByLimit: 0 };
  const evidence: Evidence[] = [];
  let stepsUsed = 0;
  let toolCalls = 0;

  // Plan, evaluate and synthesize are not tool calls; this is what is left for tools.
  const toolBudget = Math.max(1, Math.min(config.limits.maxAgentSteps - 3, config.limits.maxToolCalls));

  // 1. Understand, route, plan.
  const planStep = await handle.beginStep("plan", "Understanding the job", "understanding");
  stepsUsed++;
  await handle.activity("Reading the job");
  if (run.attachments.length) await handle.activity(`Opening ${run.attachments.length} ${run.attachments.length === 1 ? "attachment" : "attachments"}`);

  let context: JobContext = buildContext(run);
  let plan: PlanStep[] = planFromRules(context);
  let planSource: "rules" | "model" = "rules";
  let planLlm: Record<string, unknown> = {};

  // Route before execution: which model handles this job, decided deterministically.
  if (!providers.llm) {
    const error = new PactError("AGENT_PROVIDER_UNAVAILABLE", "Pact cannot work on this job: no language model is configured.");
    await handle.endStep(planStep, "failed", undefined, error);
    throw error;
  }
  const { tier, signals } = routeTask(context, plan);
  let resolution: LLMResolution;
  try {
    resolution = await providers.llm.resolve(run.selection, tier);
  } catch (error) {
    await handle.endStep(planStep, "failed", undefined, error);
    throw error;
  }
  const llm = resolution.provider;
  handle.setRouting(resolution.routing);
  await handle.activity(`Working with ${modelDisplay({ vendor: resolution.routing.vendor, model: resolution.routing.model })}`);
  const onFailover = (info: FailoverInfo) => {
    void handle.activity(failoverLine(info));
  };

  await handle.activity("Planning the work");
  let modelPlan;
  try {
    modelPlan = await planWithModel(llm, context, registry, providers, toolBudget, handle.signal, config.limits.llmTimeoutMs, onFailover, resolution.routing.mode === "manual");
  } catch (error) {
    await handle.endStep(planStep, "failed", undefined, error);
    throw error;
  }
  handle.throwIfCancelled();
  if (modelPlan) {
    context = buildContext(run, modelPlan.brief);
    plan = mergePlans(plan, modelPlan.steps, toolBudget);
    planSource = "model";
    planLlm = { provider: modelPlan.llm.vendor, model: modelPlan.llm.model, llmMs: modelPlan.llm.durationMs, failovers: modelPlan.llm.failovers?.length ?? 0 };
    if (modelPlan.llm.vendor !== resolution.routing.vendor) handle.setLlm({ vendor: modelPlan.llm.vendor, model: modelPlan.llm.model });
  }
  if (plan.length > toolBudget) {
    notes.stepsSkippedByLimit += plan.length - toolBudget;
    plan = plan.slice(0, toolBudget);
  }
  await handle.endStep(planStep, "completed", { source: planSource, tier, signals: Object.fromEntries(Object.entries(signals).filter(([, v]) => v)), deliverable: context.brief.deliverable, steps: plan.length, tools: plan.map((s) => s.tool), ...planLlm });
  if (!plan.length) await handle.activity("No tools needed; working from the job itself");

  // 2. Execute the plan.
  for (const [i, step] of plan.entries()) {
    handle.throwIfCancelled();
    if (stepsUsed >= config.limits.maxAgentSteps - 1 || toolCalls >= config.limits.maxToolCalls) {
      notes.stepsSkippedByLimit += plan.length - i;
      log.warn("agent.step_limit", { runId: run.id, stepsUsed, toolCalls, code: "STEP_LIMIT_REACHED" });
      break;
    }
    stepsUsed++;
    toolCalls++;
    evidence.push(...(await executeStep(step, handle, deps, notes)));
  }

  // 3. Evaluate: one bounded follow-up round. After a search, read the most
  // relevant results if nothing has been read yet and the budget allows.
  handle.throwIfCancelled();
  const searched = evidence.filter((e) => e.kind === "search" && e.url);
  const readAny = evidence.some((e) => e.kind === "page");
  if (searched.length && !readAny && providers.reader && stepsUsed < config.limits.maxAgentSteps - 1 && toolCalls < config.limits.maxToolCalls) {
    const evalStep = await handle.beginStep("evaluate", "Checking what was found", "researching");
    stepsUsed++;
    const room = Math.min(2, config.limits.maxAgentSteps - 1 - stepsUsed, config.limits.maxToolCalls - toolCalls);
    const followUps = searched.slice(0, Math.max(0, room)).map((s) => ({ tool: "web_read", input: { url: s.url! }, label: `Read ${s.label}` }));
    await handle.endStep(evalStep, "completed", { followUps: followUps.length });
    for (const step of followUps) {
      handle.throwIfCancelled();
      stepsUsed++;
      toolCalls++;
      evidence.push(...(await executeStep(step, handle, deps, notes)));
    }
  }

  // 4. Synthesize. A model that fails here fails the run; there is no substitute result.
  handle.throwIfCancelled();
  const synth = await handle.beginStep("synthesize", "Preparing the result", "working");
  await handle.activity("Drafting the result");
  try {
    const out = await synthesizeWithModel(llm, context, evidence, notes, handle.signal, { maxOutputTokens: OUTPUT_TOKENS[tier], onFailover });
    handle.setLlm({ vendor: out.meta.vendor, model: out.meta.model });
    await handle.activity(out.meta.failovers?.length ? `Finished with ${modelDisplay({ vendor: out.meta.vendor, model: out.meta.model })}` : "Checking it against the job");
    await handle.endStep(synth, "completed", {
      sections: out.result.sections.length,
      sources: out.result.sources.length,
      evidence: evidence.length,
      provider: out.meta.vendor,
      model: out.meta.model,
      llmMs: out.meta.durationMs,
      failovers: out.meta.failovers?.length ?? 0,
      contextItems: out.meta.context.sources,
      contextChars: out.meta.context.chars,
      contextDropped: out.meta.context.dropped,
    });
    return out.result;
  } catch (error) {
    if (isPactError(error, "RUN_CANCELLED") || handle.signal.aborted) throw error;
    await handle.endStep(synth, "failed", undefined, error);
    throw error;
  }
}
