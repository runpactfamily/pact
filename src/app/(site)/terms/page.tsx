import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms",
  description: "Terms of use for the Pact preview.",
};

// Written for the current preview build. Revisit when the live agent ships.

export default function TermsPage() {
  return (
    <article className="container legal prose">
      <header className="legal__head">
        <p className="label">Terms</p>
        <h1 className="display-2">Terms of use</h1>
        <p className="lede">The conditions for using the Pact preview.</p>
        <p className="legal__updated">Last updated 7 October 2026 · Applies to the preview build</p>
      </header>

      <section>
        <h2>What you are using</h2>
        <p>
          Pact is offered as a preview. Runs are real, but what they can do depends on which providers the deployment
          has configured, and results can be incomplete or wrong. Check the sources and the Limitations section before
          relying on a result for research, analysis, or advice.
        </p>
      </section>

      <section>
        <h2>Using the preview</h2>
        <ul className="prose__list">
          <li>You may use the preview to explore how Pact will work.</li>
          <li>Do not attempt to disrupt, overload, or gain unauthorised access to the site or the systems that serve it.</li>
          <li>Do not present a result as verified work without checking it.</li>
        </ul>
      </section>

      <section>
        <h2>Your content</h2>
        <p>
          Jobs, files and context you give Pact are sent to the Pact server and, when providers are configured, to the
          services named in the privacy notice. You remain responsible for anything you upload or type, and for making
          sure you are allowed to use any file, link, or repository you reference. Do not upload secrets or data you
          are not permitted to share. See the <Link href="/privacy">privacy notice</Link> for what is stored and where.
        </p>
      </section>

      <section>
        <h2>No warranty</h2>
        <p>
          The preview is provided as is, without warranties of any kind. It may change, break, or be withdrawn at any
          time without notice. To the extent permitted by law, we are not liable for any loss arising from your use of
          it.
        </p>
      </section>

      <section>
        <h2>Brand</h2>
        <p>
          The Pact name, wordmark, and site design belong to Pact. You may link to the site and describe it; do not
          copy the design or present yourself as Pact.
        </p>
      </section>

      <section>
        <h2>Changes</h2>
        <p>
          When accounts, pricing or new capabilities ship, these terms will be updated to cover them. The date at the
          top tells you which version you are reading.
        </p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>
          Reach us on X at{" "}
          <a href="https://x.com/runpactfamily" target="_blank" rel="noreferrer">
            @runpactfamily
          </a>
          .
        </p>
      </section>
    </article>
  );
}
