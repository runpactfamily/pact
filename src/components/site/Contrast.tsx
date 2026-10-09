import { HOME } from "@/content/site";

// Section 2: the old way as a chain of small steps, Pact as one move.

export function Contrast() {
  return (
    <div className="contrast">
      <div className="contrast__old">
        <p className="label contrast__label">Traditional software</p>
        <ol className="chain">
          {HOME.idea.traditional.map((step, i) => (
            <li key={step} className="chain__step" style={{ "--i": i } as React.CSSProperties}>
              <span className="chain__n">{String(i + 1).padStart(2, "0")}</span>
              {step}
              {i === HOME.idea.traditional.length - 1 && (
                <span className="chain__loop" aria-hidden="true">
                  ↺
                </span>
              )}
            </li>
          ))}
        </ol>
      </div>

      <div className="contrast__pact">
        <p className="label contrast__label">Pact</p>
        <div className="onemove">
          <p className="onemove__in">Give it the job.</p>
          <span className="onemove__arrow" aria-hidden="true" />
          <p className="onemove__core">
            <span className="onemove__dot" aria-hidden="true" />
            Pact
          </p>
          <span className="onemove__arrow" aria-hidden="true" />
          <p className="onemove__out">Finished work.</p>
        </div>
      </div>
    </div>
  );
}
