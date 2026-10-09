"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ChangeEvent, KeyboardEvent, ReactNode } from "react";
import { cx } from "@/lib/cx";
import { pact } from "@/lib/pact/client";
import type { Attachment, ModelCatalog, ModelSelection, RunInput } from "@/lib/pact/types";
import { AttachmentChip } from "../AttachmentChip";
import { ArrowRight, CloseIcon, GitHubIcon, LinkIcon, Paperclip } from "../Icons";
import { ModelSelect } from "./ModelSelect";

type Panel = "link" | "github";

interface ComposerProps {
  onSubmit: (input: RunInput) => void;
  /** A run is being created; the composer shows its launch state. */
  busy?: boolean;
  /** Prefills the task. Changing it replaces what is in the field. */
  initialTask?: string;
  /** Used when Run is pressed with an empty field (landing-page demo). */
  fallbackTask?: string;
  size?: "md" | "lg";
  autoFocus?: boolean;
  /** Live model lists; omit to hide the model selector. */
  catalog?: ModelCatalog | null;
  /** Rendered in the run bar before the model selector (e.g. a chain picker). */
  leading?: ReactNode;
  placeholder?: string;
}

const uid = () => Math.random().toString(36).slice(2, 10);

function parseLink(raw: string): Attachment | null {
  const value = raw.trim();
  if (!value) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (!url.hostname.includes(".")) return null;
    const path = url.pathname === "/" ? "" : url.pathname;
    return { id: uid(), kind: "link", label: url.hostname.replace(/^www\./, "") + path, detail: url.href };
  } catch {
    return null;
  }
}

function parseRepo(raw: string): Attachment | null {
  const value = raw
    .trim()
    .replace(/^https?:\/\/(www\.)?github\.com\//i, "")
    .replace(/\.git$/, "")
    .replace(/\/$/, "");
  const match = value.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (!match) return null;
  const repo = `${match[1]}/${match[2]}`;
  return { id: uid(), kind: "github", label: repo, detail: `https://github.com/${repo}` };
}

const PANELS: Record<Panel, { placeholder: string; error: string; parse: (raw: string) => Attachment | null }> = {
  link: { placeholder: "Paste a link", error: "That doesn’t look like a link.", parse: parseLink },
  github: { placeholder: "owner/repository", error: "Use the form owner/repository.", parse: parseRepo },
};

export function Composer({
  onSubmit,
  busy = false,
  initialTask = "",
  fallbackTask,
  size = "md",
  autoFocus = false,
  catalog,
  leading,
  placeholder = "What do you need done?",
}: ComposerProps) {
  const id = useId();
  const [task, setTask] = useState(initialTask);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [model, setModel] = useState<ModelSelection>({ mode: "auto" });
  const textRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLInputElement>(null);

  // A new prefill replaces what is in the field (state adjusted during render, per React guidance).
  const [seenInitial, setSeenInitial] = useState(initialTask);
  if (initialTask !== seenInitial) {
    setSeenInitial(initialTask);
    setTask(initialTask);
  }

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [task]);

  useEffect(() => {
    // Skip on touch devices so the keyboard doesn't cover the page on load.
    if (autoFocus && window.matchMedia("(pointer: fine)").matches) textRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (panel) panelRef.current?.focus();
  }, [panel]);

  const uploading = attachments.some((a) => a.detail === "Uploading…");
  const canRun = !busy && !uploading && (task.trim().length > 0 || Boolean(fallbackTask));

  function submit() {
    if (!canRun) return;
    const text = task.trim() || fallbackTask || "";
    if (!task.trim()) setTask(text);
    setPanel(null);
    setError("");
    onSubmit({ task: text, attachments, model });
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      submit();
    }
  }

  async function onFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    for (const file of files) {
      const placeholder: Attachment = { id: uid(), kind: "file", label: file.name, detail: "Uploading…" };
      setAttachments((prev) => [...prev, placeholder]);
      try {
        const uploaded = await pact.uploadFile(file);
        setAttachments((prev) => prev.map((a) => (a.id === placeholder.id ? { ...uploaded, id: placeholder.id } : a)));
      } catch (caught) {
        setAttachments((prev) => prev.filter((a) => a.id !== placeholder.id));
        setError(caught instanceof Error ? caught.message : `${file.name} could not be uploaded.`);
      }
    }
  }

  function togglePanel(next: Panel) {
    setDraft("");
    setError("");
    setPanel((current) => (current === next ? null : next));
  }

  function addFromPanel() {
    if (!panel) return;
    const attachment = PANELS[panel].parse(draft);
    if (!attachment) {
      setError(PANELS[panel].error);
      return;
    }
    setAttachments((prev) => [...prev, attachment]);
    setDraft("");
    setError("");
    setPanel(null);
    textRef.current?.focus();
  }

  return (
    <div className={cx("composer", `composer--${size}`, busy && "is-busy")}>
      <label className="sr-only" htmlFor={id}>
        What do you need done?
      </label>
      <textarea
        id={id}
        ref={textRef}
        className="composer__input"
        rows={2}
        placeholder={placeholder}
        value={task}
        onChange={(event) => setTask(event.target.value)}
        onKeyDown={onKeyDown}
        readOnly={busy}
      />

      {attachments.length > 0 && (
        <ul className="composer__attachments" aria-label="Attached context">
          {attachments.map((attachment) => (
            <li key={attachment.id}>
              <AttachmentChip
                attachment={attachment}
                onRemove={busy ? undefined : () => setAttachments((prev) => prev.filter((a) => a.id !== attachment.id))}
              />
            </li>
          ))}
        </ul>
      )}

      {panel && !busy && (
        <div className="composer__panel">
          <div className="composer__panelrow">
            <input
              ref={panelRef}
              className="composer__field"
              type="text"
              inputMode={panel === "link" ? "url" : "text"}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder={PANELS[panel].placeholder}
              aria-label={panel === "link" ? "Link to add" : "GitHub repository to add"}
              aria-invalid={Boolean(error)}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                setError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addFromPanel();
                }
                if (event.key === "Escape") setPanel(null);
              }}
            />
            <button type="button" className="btn btn--sm btn--ghost" onClick={addFromPanel}>
              Add
            </button>
            <button type="button" className="iconbtn" onClick={() => setPanel(null)} aria-label="Cancel">
              <CloseIcon />
            </button>
          </div>
          {error && (
            <p className="composer__error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}

      {error && !panel && (
        <p className="composer__error composer__error--bare" role="alert">
          {error}
        </p>
      )}

      <div className="composer__bar">
        <div className="composer__tools">
          <input ref={fileRef} type="file" multiple hidden onChange={onFiles} tabIndex={-1} />
          <button type="button" className="tool" onClick={() => fileRef.current?.click()} disabled={busy}>
            <Paperclip />
            Add files
          </button>
          <button type="button" className="tool" onClick={() => togglePanel("link")} aria-expanded={panel === "link"} disabled={busy}>
            <LinkIcon />
            Add links
          </button>
          <button type="button" className="tool" onClick={() => togglePanel("github")} aria-expanded={panel === "github"} disabled={busy}>
            <GitHubIcon />
            GitHub
          </button>
        </div>
        <div className="composer__run">
          {leading}
          {catalog !== undefined && <ModelSelect catalog={catalog} value={model} onChange={setModel} disabled={busy} />}
          <button type="button" className={cx("btn btn--run", busy && "is-launching")} onClick={submit} disabled={!canRun}>
            <span>{busy ? "Starting" : "Run"}</span>
            <ArrowRight />
            <span className="btn--run__bar" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
