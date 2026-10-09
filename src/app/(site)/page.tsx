import Link from "next/link";
import { ArrowRight } from "@/components/Icons";
import { Reveal } from "@/components/Reveal";
import { AppPreview } from "@/components/site/AppPreview";
import { Contrast } from "@/components/site/Contrast";
import { HeroVisual } from "@/components/site/HeroVisual";
import { Loop } from "@/components/site/Loop";
import { OnchainSection } from "@/components/site/OnchainSection";
import { WorkExamples } from "@/components/site/WorkExamples";
import { HOME, SITE } from "@/content/site";

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="hero">
        <HeroVisual />
        <div className="container hero__inner">
          <p className="pill">
            <span className="pill__dot" aria-hidden="true" />
            Autonomous work agent
          </p>
          <h1 className="hero__title">
            <span>Give it</span> <span>a job.</span>
          </h1>
          <div className="hero__row">
            <p className="hero__lede">{SITE.description}</p>
            <div className="hero__actions">
              <Link href="/app" className="btn btn--lg btn--accent">
                Give Pact a job
                <ArrowRight />
              </Link>
              <Link href="/how-it-works" className="textlink">
                See how it works
              </Link>
            </div>
          </div>
        </div>
        <div className="container hero__strip" aria-hidden="true">
          {HOME.heroStrip.map((item, i) => (
            <span key={item}>
              <span className="label">{String(i + 1).padStart(2, "0")}</span>
              {item}
            </span>
          ))}
        </div>
      </section>

      {/* Big idea */}
      <section className="section idea">
        <div className="container">
          <Reveal className="idea__head">
            <h2 className="display-1">{HOME.idea.headline}</h2>
            <div className="idea__copy">
              {HOME.idea.copy.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </Reveal>
          <Reveal delay={120}>
            <Contrast />
          </Reveal>
        </div>
      </section>

      {/* Product system */}
      <section className="section stone system">
        <div className="container">
          <Reveal className="system__head">
            <p className="label">The Pact loop</p>
            <h2 className="display-1">{HOME.loop.headline}</h2>
          </Reveal>
          <Loop />
        </div>
      </section>

      {/* Large product preview */}
      <section className="section preview">
        <div className="container">
          <Reveal className="preview__head">
            <p className="label">Pact at work</p>
            <h2 className="display-2">
              Not an answer.
              <br />
              The work itself.
            </h2>
          </Reveal>
        </div>
        <div className="container container--wide">
          <Reveal>
            <AppPreview />
          </Reveal>
        </div>
      </section>

      {/* Real work */}
      <section className="section work">
        <div className="container">
          <Reveal className="work__head">
            <p className="label">Real work</p>
            <h2 className="display-2">{HOME.work.headline}</h2>
          </Reveal>
          <WorkExamples />
        </div>
      </section>

      {/* Pact Onchain */}
      <OnchainSection />

      {/* Brand statement */}
      <section className="section dark statement">
        <div className="container">
          <Reveal>
            <h2 className="statement__title">{HOME.statement.headline}</h2>
          </Reveal>
          <Reveal delay={150} className="statement__lines">
            {HOME.statement.lines.map((line, i) => (
              <p key={line}>
                <span className="statement__n label">{String(i + 1).padStart(2, "0")}</span>
                {line}
              </p>
            ))}
          </Reveal>
        </div>
      </section>

      {/* Philosophy */}
      <section className="section belief">
        <div className="container belief__grid">
          <Reveal>
            <h2 className="belief__title">
              {HOME.philosophy[0]}
              <br />
              <em>{HOME.philosophy[1]}</em>
            </h2>
          </Reveal>
          <Reveal delay={150} className="span" aria-hidden="true">
            <span className="span__end">Intention</span>
            <span className="span__line">
              <span className="span__pact">
                <span className="span__dot" />
                Pact
              </span>
            </span>
            <span className="span__end">Outcome</span>
          </Reveal>
        </div>
      </section>

      {/* Final CTA */}
      <section className="closing">
        <div className="container">
          <Reveal className="closing__inner">
            <h2 className="closing__title">{HOME.closing}</h2>
            <Link href="/app" className="btn btn--lg btn--accent">
              Give Pact a job
              <ArrowRight />
            </Link>
          </Reveal>
        </div>
      </section>
    </>
  );
}
