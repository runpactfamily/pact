import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What Pact does with your jobs, files and results.",
};

// Written for the current preview build. Update this when accounts, a hosted
// database, or new providers change where data goes.

export default function PrivacyPage() {
  return (
    <article className="container legal prose">
      <header className="legal__head">
        <p className="label">Privacy</p>
        <h1 className="display-2">Privacy notice</h1>
        <p className="lede">What Pact does, and does not do, with your data.</p>
        <p className="legal__updated">Last updated 7 October 2026 · Applies to the preview build</p>
      </header>

      <section>
        <h2>The short version</h2>
        <p>
          When you run a job, the job text, the files you attach and the result are sent to and kept by the Pact server
          so you can come back to them. There are no accounts yet: your runs are tied to an id your browser generates.
          Nothing is sold, and nothing is used for advertising.
        </p>
      </section>

      <section>
        <h2>What is stored, and where</h2>
        <ul className="prose__list">
          <li>
            <strong>Jobs and results.</strong> The text you type, the plan Pact made, which tools ran (names, timings,
            counts), the progress lines, and the result. Stored on the Pact server.
          </li>
          <li>
            <strong>Files.</strong> Uploaded files are checked, read on the server to extract their text and tables, and
            kept with that extracted text so the agent can use them. They are not sent to an outside service to be read.
          </li>
          <li>
            <strong>Links and repositories.</strong> Kept as text with the run. A page is fetched only when a reader
            provider is configured; a repository is read only when a GitHub token is configured.
          </li>
          <li>
            <strong>Your browser id.</strong> A random id in your browser&apos;s local storage, sent with each request
            to scope your runs and files. Clearing site data creates a new one; the old runs stay on the server but are no
            longer reachable from that browser.
          </li>
        </ul>
      </section>

      <section>
        <h2>What goes to third parties</h2>
        <p>
          Only when the operator of this deployment has configured the provider, and only what the job needs:
        </p>
        <ul className="prose__list">
          <li>
            <strong>Language models</strong> (Claude, Gemini and open-weight models, through their API providers). The
            job, a brief, and the evidence gathered for it (file text, page text, search snippets) are sent to plan the
            work and write the result. The result shows which model did the work.
          </li>
          <li>
            <strong>Web search providers.</strong> The search query derived from your job.
          </li>
          <li>
            <strong>Page reading providers.</strong> The URL to read.
          </li>
          <li>
            <strong>GitHub.</strong> The repository and file paths to read.
          </li>
        </ul>
        <p>
          Provider credentials belong to the deployment, never to you, and are never shown or stored with a run. If a
          provider is not configured, the related step is skipped and reported as unavailable.
        </p>
      </section>

      <section>
        <h2>What we do not collect</h2>
        <p>
          The site uses no analytics, advertising trackers or third-party cookies. Server logs record run ids, tool
          names, durations and error codes, not the contents of jobs or files. Typefaces are bundled with the site and
          served from the same origin.
        </p>
      </section>

      <section>
        <h2>Retention and deletion</h2>
        <p>
          Runs and files are kept until deleted. There is no delete button yet; it arrives with accounts. Until then,
          ask us and we will remove them, or run your own deployment, where <code>.pact-data</code> holds everything and
          can be emptied at any time.
        </p>
      </section>

      <section>
        <h2>When this changes</h2>
        <p>
          Accounts, a hosted database, or new providers will change where data lives. This notice is updated before
          any of that ships; the date at the top tells you which version you are reading.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>
          Questions about this notice can be sent to us on X at{" "}
          <a href="https://x.com/runpactfamily" target="_blank" rel="noreferrer">
            @runpactfamily
          </a>
          . See also the <Link href="/terms">terms of use</Link>.
        </p>
      </section>
    </article>
  );
}
