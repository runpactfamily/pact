"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { cx } from "@/lib/cx";

export interface DocsSection {
  id: string;
  title: string;
  /** Sections sharing a group are listed under one heading. */
  group?: string;
}

interface DocsTocProps {
  sections: DocsSection[];
}

function jump(id: string, behavior: ScrollBehavior) {
  document.getElementById(id)?.scrollIntoView({ behavior, block: "start" });
}

/** In-page contents list. Scrolls without touching the URL; `?section=` deep-links a section. */
export function DocsToc({ sections }: DocsTocProps) {
  const params = useSearchParams();
  const [active, setActive] = useState(sections[0]?.id);

  useEffect(() => {
    const wanted = params.get("section");
    if (!wanted || !sections.some((s) => s.id === wanted)) return;
    jump(wanted, "auto");
    // Fonts and late layout move the target after the first jump; land on it again once things settle.
    const timers = [250, 900].map((ms) => setTimeout(() => jump(wanted, "auto"), ms));
    return () => timers.forEach(clearTimeout);
  }, [params, sections]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id);
        }
      },
      { rootMargin: "-20% 0px -65% 0px" },
    );
    for (const section of sections) {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [sections]);

  const groups: { name: string; items: DocsSection[] }[] = [];
  for (const section of sections) {
    const name = section.group ?? "";
    const last = groups[groups.length - 1];
    if (last && last.name === name) last.items.push(section);
    else groups.push({ name, items: [section] });
  }

  return (
    <nav className="toc" aria-label="On this page">
      {groups.map((group) => (
        <div key={group.name || "contents"} className="toc__group">
          <p className="label">{group.name || "On this page"}</p>
          <ul>
            {group.items.map((section) => (
              <li key={section.id}>
                <button
                  type="button"
                  className={cx("toc__link", active === section.id && "is-active")}
                  aria-current={active === section.id ? "location" : undefined}
                  onClick={() => jump(section.id, "smooth")}
                >
                  {section.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
