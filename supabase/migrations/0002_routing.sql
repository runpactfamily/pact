-- Pact — model selection and routing metadata on runs (Phase 3.1).
-- Safe metadata only: vendor, model id, tier, fallback chain. Never keys.

alter table runs add column if not exists selection jsonb not null default '{"mode":"auto"}';
alter table runs add column if not exists routing jsonb;
