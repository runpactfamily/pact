"use client";

import Link from "next/link";
import { useState } from "react";
import { EXAMPLE_JOBS, JOB_CATEGORIES } from "@/content/site";
import type { JobCategory } from "@/content/site";
import { cx } from "@/lib/cx";
import { ArrowRight } from "../Icons";

type Filter = JobCategory | "All";

export function JobGallery() {
  const [filter, setFilter] = useState<Filter>("All");
  const jobs = filter === "All" ? EXAMPLE_JOBS : EXAMPLE_JOBS.filter((job) => job.category === filter);

  return (
    <div className="gallery">
      <div className="gallery__filters" role="group" aria-label="Filter example jobs">
        {(["All", ...JOB_CATEGORIES] as Filter[]).map((category) => (
          <button
            key={category}
            type="button"
            className={cx("filter", filter === category && "is-active")}
            aria-pressed={filter === category}
            onClick={() => setFilter(category)}
          >
            {category}
          </button>
        ))}
      </div>

      <ul className="gallery__grid" key={filter}>
        {jobs.map((job) => (
          <li key={job.job}>
            <Link href={{ pathname: "/app", query: { task: job.job } }} className="job">
              <span className="label job__category">{job.category}</span>
              <p className="job__text">{job.job}</p>
              <dl className="job__meta">
                <div>
                  <dt className="label">Context</dt>
                  <dd>{job.context}</dd>
                </div>
                <div>
                  <dt className="label">Returns</dt>
                  <dd>{job.returns}</dd>
                </div>
              </dl>
              <span className="job__go">
                Give Pact this job
                <ArrowRight />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
