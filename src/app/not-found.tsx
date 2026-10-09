import Link from "next/link";
import { ArrowRight } from "@/components/Icons";
import { Wordmark } from "@/components/Wordmark";

export default function NotFound() {
  return (
    <main className="notfound">
      <Link href="/" aria-label="Pact, home">
        <Wordmark />
      </Link>
      <div>
        <p className="label">404</p>
        <h1 className="display-2">Nothing here to work on.</h1>
        <p className="lede">The page you asked for doesn’t exist. The job you had in mind probably still does.</p>
        <div className="notfound__actions">
          <Link href="/app" className="btn">
            Open App
            <ArrowRight />
          </Link>
          <Link href="/" className="btn btn--ghost">
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
