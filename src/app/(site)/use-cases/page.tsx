import type { Metadata } from "next";
import { JobGallery } from "@/components/site/JobGallery";

export const metadata: Metadata = {
  title: "Use cases",
  description: "Examples of jobs Pact can take: research, documents, data, code, market analysis, comparisons and planning.",
};

export default function UseCasesPage() {
  return (
    <>
      <header className="container pagehead">
        <p className="label">Use cases</p>
        <h1 className="display-2 pagehead__title">
          One agent. <em>Many kinds of job.</em>
        </h1>
        <p className="lede">
          These are examples of work Pact can perform, not separate products. The categories are only a way to browse.
          If it is a job and you can give Pact the context, it can take it.
        </p>
      </header>

      <section className="container gallerywrap">
        <JobGallery />
      </section>
    </>
  );
}
