import type { Metadata } from "next";
import { FileIcon, GitHubIcon, LinkIcon } from "@/components/Icons";

export const metadata: Metadata = { title: "Integrations" };

const AVAILABLE = [
  {
    name: "Files",
    body: "Attach documents, spreadsheets and exports to any job.",
    icon: FileIcon,
  },
  {
    name: "Links",
    body: "Point a job at pages, articles and reports.",
    icon: LinkIcon,
  },
  {
    name: "GitHub",
    body: "Reference a repository by owner and name.",
    icon: GitHubIcon,
  },
];

const PLANNED = [
  { name: "Cloud storage", body: "Give Pact a folder instead of uploading files one by one." },
  { name: "Team workspace", body: "Send finished results to where your team already works." },
  { name: "Databases", body: "Let a job query your data directly, read-only." },
];

export default function IntegrationsPage() {
  return (
    <div className="view">
      <header className="viewhead">
        <div>
          <h1 className="viewhead__title">Integrations</h1>
          <p className="viewhead__sub">Where Pact gets its context from.</p>
        </div>
      </header>

      <section className="block">
        <header className="block__head">
          <h2 className="label">In the composer</h2>
        </header>
        <ul className="integrations">
          {AVAILABLE.map(({ name, body, icon: Glyph }) => (
            <li key={name} className="integration">
              <span className="integration__icon">
                <Glyph />
              </span>
              <div>
                <h3>{name}</h3>
                <p>{body}</p>
              </div>
              <span className="tag tag--on">Available</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="block">
        <header className="block__head">
          <h2 className="label">Planned</h2>
        </header>
        <ul className="integrations">
          {PLANNED.map(({ name, body }) => (
            <li key={name} className="integration integration--planned">
              <span className="integration__icon" />
              <div>
                <h3>{name}</h3>
                <p>{body}</p>
              </div>
              <span className="tag">Planned</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
