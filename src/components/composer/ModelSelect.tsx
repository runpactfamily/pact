"use client";

import { useId } from "react";
import { modelGroupLabel, modelLabel } from "@/lib/pact/models";
import type { ModelCatalog, ModelSelection, ModelVendor } from "@/lib/pact/types";

interface ModelSelectProps {
  catalog: ModelCatalog | null;
  value: ModelSelection;
  onChange: (value: ModelSelection) => void;
  disabled?: boolean;
}

const ORDER: ModelVendor[] = ["openrouter", "gemini", "groq"];

function encode(value: ModelSelection): string {
  return value.mode === "auto" ? "auto" : `${value.provider}:${value.model}`;
}

function decode(raw: string): ModelSelection {
  if (raw === "auto") return { mode: "auto" };
  const i = raw.indexOf(":");
  return { mode: "manual", provider: raw.slice(0, i) as ModelVendor, model: raw.slice(i + 1) };
}

function price(p?: { input: number; output: number }): string {
  if (!p) return "";
  if (p.input === 0 && p.output === 0) return " · free";
  return ` · $${p.input}/$${p.output} per M`;
}

/** Compact model picker: Auto, then each vendor's live models. Unconfigured vendors are shown but cannot be chosen. */
export function ModelSelect({ catalog, value, onChange, disabled }: ModelSelectProps) {
  const id = useId();
  const current = encode(value);
  const label = value.mode === "auto" ? "Auto" : modelLabel(value.model);

  return (
    <label className="modelsel" title={label}>
      <span className="sr-only" id={`${id}-label`}>
        Model
      </span>
      <span className="modelsel__value" aria-hidden="true">
        {value.mode === "auto" ? "Auto" : modelLabel(value.model)}
      </span>
      <svg className="modelsel__chevron" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
        <path d="m2.5 4.5 3.5 3.5 3.5-3.5" />
      </svg>
      <select
        className="modelsel__select"
        aria-labelledby={`${id}-label`}
        value={current}
        disabled={disabled}
        onChange={(event) => onChange(decode(event.target.value))}
      >
        <option value="auto">Auto — Pact picks the model for the job</option>
        {ORDER.map((vendor) => {
          const entry = catalog?.vendors.find((v) => v.vendor === vendor);
          const name = modelGroupLabel(vendor);
          if (!catalog) return <optgroup key={vendor} label={`${name} — loading`} disabled />;
          if (!entry?.available) return <optgroup key={vendor} label={`${name} — Unavailable`} disabled />;
          if (!entry.models.length) return <optgroup key={vendor} label={`${name} — no models listed`} disabled />;
          return (
            <optgroup key={vendor} label={name}>
              {entry.models.map((m) => (
                <option key={m.id} value={`${vendor}:${m.id}`}>
                  {modelLabel(m.id)}
                  {m.contextLength ? ` · ${Math.round(m.contextLength / 1000)}k` : ""}
                  {price(m.pricing)}
                </option>
              ))}
            </optgroup>
          );
        })}
      </select>
    </label>
  );
}
