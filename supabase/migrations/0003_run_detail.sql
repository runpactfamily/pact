-- Pact — steps, tool calls and sources stored on the run row (Phase 3.2, Cloudflare).
-- One write per save instead of four: Workers allow a small number of
-- outbound requests per invocation, and every save of a run's progress was
-- costing several. The run_steps, tool_calls and sources tables stay for
-- runs written before this migration and are still read when detail is null.

alter table runs add column if not exists detail jsonb;
