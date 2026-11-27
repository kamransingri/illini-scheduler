import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Data sources",
  description: "Where Illini Scheduler's course, grade and rating data comes from, and why small sections have no grades.",
};

const LINK = "text-action underline hover:text-action-dark";
const H2 = "font-display text-xl font-bold text-heading";
const WADE = "https://github.com/wadefagen/datasets";

// Word for word from github.com/wadefagen/datasets/blob/main/gpa/README.md, "Exclusion of Data" (#191)
const FOIA_QUOTE =
  "Please be advised that certain information has been withheld under section 140/7(1)(a) that exempts from disclosure “[i]nformation specifically prohibited from disclosure by federal or State law or rules and regulations implementing adopted under federal or State law.” Specifically, the Family Educational Rights and Privacy Act (FERPA) (20 U.S.C. §1232g) protects the privacy of student education records and prohibits the release of any information from a student’s education record without the consent of the eligible student. In this case, grade distributions are not displayed when a section has low enrollment or when all students in the class have the same grade. Because of the low enrollment in those classes or because all the students in a class received the same grade, the grade data could identify a student.  Thus, such information was not provided to you as it would not only violate FERPA, but it would also be invasion of personal privacy under Section 7(1)(c) of FOIA which exempts from disclosure “personal information.”";
const EXCLUSION_QUOTE = "Based on analysis, courses with 20 or fewer students were excluded (the smallest course in the dataset has 21 students).";

function Source({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`${id}-h`} id={id}>
      <h2 id={`${id}-h`} className={H2}>
        {title}
      </h2>
      <div className="mt-2 space-y-3">{children}</div>
    </section>
  );
}

export default function DataSourcesPage() {
  return (
    <div className="max-w-3xl space-y-8">
      <header>
        <h1 className="font-display text-2xl font-bold text-heading">Data sources</h1>
        <p className="mt-3">
          Illini Scheduler is built from public data. Here is where each part comes from, who publishes it and how often the site reads it. The site is
          unofficial: check the <Link href="/terms/" className={LINK}>terms of use</Link> before you rely on it.
        </p>
      </header>

      <Source id="course-explorer" title="Course Explorer">
        <p>
          Sections, meeting times, instructors, descriptions, gen-ed attributes, final exams and seat status come from the University of Illinois&apos;{" "}
          <a href="https://courses.illinois.edu/" className={LINK} target="_blank" rel="noopener noreferrer">
            Course Explorer
          </a>
          . Older terms come from Wade Fagen-Ulmschneider&apos;s{" "}
          <a href={`${WADE}/tree/main/course-catalog`} className={LINK} target="_blank" rel="noopener noreferrer">
            copy of the course catalog
          </a>
          . The current and next term are read from the live course pages every day, and the busiest courses about every 10 minutes for{" "}
          <Link href="/opened/" className={LINK}>
            Just opened
          </Link>
          .
        </p>
      </Source>

      <Source id="gpa" title="Grades: the UIUC GPA dataset">
        <p>
          Course and professor GPAs and grade distributions come from{" "}
          <a href={`${WADE}/tree/main/gpa`} className={LINK} target="_blank" rel="noopener noreferrer">
            Wade Fagen-Ulmschneider&apos;s GPA dataset
          </a>
          . The University released terms before Spring 2025 in response to FOIA requests, and terms from Spring 2025 on in response to Urbana Senate
          item EP.25.072, brought by the Illinois Student Council. A term is added once its data is published there.
        </p>
        <p>The University leaves small sections out to protect students&apos; privacy. From FOIA #2018-150, as quoted in the dataset&apos;s README:</p>
        <blockquote className="border-l-4 border-line pl-4 text-ink" data-testid="ferpa-quote">
          {FOIA_QUOTE}
        </blockquote>
        <p>And from the same README:</p>
        <blockquote className="border-l-4 border-line pl-4 text-ink" data-testid="exclusion-quote">
          {EXCLUSION_QUOTE}
        </blockquote>
        <p>
          So a course or professor with &quot;No grade data&quot; usually means every section was small, not that grades are hidden here. The site&apos;s build
          stops if a row of 20 or fewer students ever reaches it.
        </p>
      </Source>

      <Source id="geneds" title="Gen-ed categories">
        <p>
          Which courses count for which general education requirement comes from{" "}
          <a href={`${WADE}/tree/main/geneds`} className={LINK} target="_blank" rel="noopener noreferrer">
            Wade Fagen-Ulmschneider&apos;s gen-ed list
          </a>
          .
        </p>
      </Source>

      <Source id="tre" title="Teachers Ranked as Excellent">
        <p>
          The &quot;Teachers Ranked as Excellent&quot; badges on professors come from{" "}
          <a href={`${WADE}/tree/main/teachers-ranked-as-excellent`} className={LINK} target="_blank" rel="noopener noreferrer">
            Wade Fagen-Ulmschneider&apos;s copy of the campus list
          </a>
          , which is based on student ratings. It covers instructors only, not teaching assistants.
        </p>
      </Source>

      <Source id="rmp" title="Rate My Professors">
        <p>
          Professor ratings, tags and review snippets come from{" "}
          <a href="https://www.ratemyprofessors.com/" className={LINK} target="_blank" rel="noopener noreferrer">
            Rate My Professors
          </a>
          , written by students and not checked by the University. The site keeps them for up to 7 days before reading them again, and works without them. Its matches between
          Course Explorer names and Rate My Professors profiles can be wrong.
        </p>
      </Source>
    </div>
  );
}
