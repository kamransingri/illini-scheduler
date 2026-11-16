# Ideas

Things we'd like Illini Scheduler to do next. These are ideas, not promises. Each notes what it would take, because
some of them change what the site is: today it's a static site with no backend ([LIMITATIONS.md](LIMITATIONS.md)).

## 1. Student reviews and rankings

**The idea:** students who've taken a course share how it went, and the site uses that to rank courses and professors
alongside GPA and Rate My Professors. Reviews could go to RMP, to our site, or both, so the next student gets better
advice.

### Step 1: send people to RMP (small, no backend)

- Add a "Rate this professor on RMP" link on each professor row and on the course page. The site already stores each
  matched professor's RMP page.
- RMP has no API for posting, so the site can only send people there; it can't post for them.
- New RMP ratings flow back into the site on the next nightly run, so this improves our data without us storing
  anything.
- Show it where it's most useful: after a term ends, next to courses in "My courses" that are marked as finished.

### Step 2: reviews on our site (needs a backend)

A static site can't accept posts, so this needs somewhere to store reviews. Options:

| Option | Good | Not so good |
| --- | --- | --- |
| GitHub Discussions shown on the page (e.g. giscus) | Free, no server, keeps the site static | Needs a GitHub account; free text only; hard to turn into numbers |
| Small serverless backend (e.g. Cloudflare Workers + D1, or Supabase) | Structured reviews, real rankings, our own rules | Something to run, secure and moderate |

If we build our own:

- **Who can post:** verify an `@illinois.edu` email with a one-time link (never a NetID login, never Self-Service).
  Store only a hash of the email, to allow one review per person per course per term.
- **What to ask:** mostly structured answers, which are easier to rank and moderate than free text. For example:
  hours per week, difficulty (1–5), would take again, how clear the grading was, the term taken, optional grade,
  short tags ("lots of homework", "curved exams"), plus an optional short comment.
- **Moderation:** a report button, a short posting policy (about the course and teaching, nothing personal), a way
  for professors to request review of a post, and a hidden-until-checked state for reported posts.
- **Privacy:** show reviews without names. Don't show a breakdown so small that it identifies someone (for example,
  hide a section's numbers until it has at least 5 reviews).

### Step 3: rankings

- Add student reviews to the best pick score as one more input with its own weight, pulled toward an average when
  there are few reviews, the same way RMP is (D13.18).
- Every number keeps its source and sample size: "4.1 from 23 reviews, Fall 2025 to Fall 2026".
- Ranking pages: top-rated courses per gen-ed category, per department, and "easiest workload for the GPA".
- Keep RMP and our reviews visible separately, so students can see where a number comes from.

## 2. Seat alerts

Email or a phone notification when a closed section opens. The "Watch seats" RSS feed already exists; alerts need a
backend (the same one as reviews) or a push service. The site checks seats once a day, so alerts would be daily too
unless the availability job runs more often.

## 3. Better degree planning

- Hand-check the largest majors first (Computer Science, Psychology, Economics, Mechanical Engineering, Finance,
  Accountancy…) and fix what the importer gets wrong.
- Minors and certificates.
- Paste your DARS report or transcript as text and have the browser fill in "My courses". The text would be read in
  the browser and never uploaded, so no NetID is involved.
- Check prerequisites against "My courses" instead of only showing the catalog's text.
- A four-year plan: drag courses into terms and see which requirements each term finishes.

## 4. Smaller improvements

- Link renumbered courses to their old numbers so their GPA history carries over.
- Use the official academic calendar dates for the calendar export.
