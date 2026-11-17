# Ideas

Things we'd like Illini Scheduler to do next. These are ideas, not promises. Each notes what it would take, because
some of them change what the site is: today it's a static site with no backend ([LIMITATIONS.md](LIMITATIONS.md)).

| # | Idea | Needs a backend? | Size |
| --- | --- | --- | --- |
| 1 | Student reviews and rankings | Step 1 no, steps 2-3 yes | Large |
| 2 | Course and professor feedback from Reddit | No (a weekly job, like RMP) | Medium |
| 3 | Seat alerts | Yes, for alerts with the tab closed | Medium |
| 4 | Better degree planning | No | Medium to large |
| 5 | Smaller improvements | No | Small |

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

## 2. Course and professor feedback from Reddit

**The idea:** r/UIUC holds years of threads where students say what a course was really like and how a professor
teaches ("CS 225 with X or Y?", "easiest QR gen-ed for spring?", "is STAT 400 curved?"). Read those threads, work out
which course and which professor each comment is about, and turn what people wrote into ratings shown next to Rate My
Professors: a Reddit rating per professor and course, with the sentences behind it and a link back to every thread.
It's the same kind of signal as RMP, from a different (and often more candid) crowd, and it covers courses where nobody
has written an RMP review.

What the site does with Reddit today: nothing.

### How it would work

1. **Collect.** A weekly job (`pipeline/reddit.py`, like `rmp.py`) uses Reddit's official Data API with an OAuth
   "script" app to search r/UIUC for each course code in its common spellings (`CS 225`, `cs225`, `225` inside a CS
   thread) and for the surnames of professors teaching the next term. It keeps the post and comment ids, permalink,
   date, score and text, cached like RMP so each run only asks for what's new. Raw text stays out of the repo.
2. **Find what each comment is about.** Course codes with the search box's parser and nicknames (`parseCode`,
   `ALIASES`: "calc 2" is MATH 231). Professors only by matching a name against the instructors of a course the
   comment or its thread already names (`pipeline/names.py`), so "Lee" alone never matches anyone. No course, no match:
   the comment is skipped.
3. **Turn text into ratings.** For each (comment, course, professor) mention, a language model (for example Claude
   Haiku through the Message Batches API: a few thousand short comments a week costs very little) returns a fixed set of
   fields: teaching quality 1-5, difficulty 1-5, workload in hours a week if stated, would recommend yes / no / unclear,
   exam style, curve, attendance, and the exact sentence each answer came from. A field the comment doesn't support
   stays empty, the same rule the exam and grading notes follow (DECISIONS D5.1): no quote, no number.
4. **Combine.** Per professor and course: how many distinct comments, the average of each field, newer comments
   counting more (for example a two-year half-life), highly upvoted ones a little more, and few comments pulled toward
   the course or campus average the way the best pick score treats RMP (D13.18). One author counts once per course per
   thread. Show a number only from about 3 comments up.
5. **Show it.** A "Reddit" column next to RMP on the professor row ("4.2 from 14 comments, 2023 to 2026"), the two or
   three most useful quotes (short, with a link to the thread, never the username), and tags like "curved", "heavy
   workload". Later, an optional Reddit weight in the best pick score, off until the numbers have been checked.
6. **Check it before trusting it.** Hand-label about 200 comments for the four reference courses (CS 124, MATH 221,
   STAT 107, RHET 105), measure how often the extracted fields agree with the labels and how Reddit ratings line up with
   RMP and GPA, and write the numbers in PROGRESS.md. Ship only if the agreement is good.

### Things to get right

- **Reddit's terms.** Use the official API within its rate limits and its terms for non-commercial use (check the
  current Data API terms before building, they have changed before). Quote briefly and always link back; when a
  comment is deleted on Reddit, drop it here on the next run.
- **Privacy.** Never store or show usernames. Skip comments about TAs (they're students), about people's personal
  lives, or that aren't about teaching or the course.
- **Bias.** Reddit leans toward engineering and CS courses and toward strong opinions; sarcasm is common; a thread from
  a professor's first semester can follow them for years. Show the date range and the count with every number, weight
  recent comments more, and keep Reddit, RMP and GPA visibly separate so students can see where a number comes from.
- **Wrong matches.** Show the sentence that caused each match ("Lee for 233 was great") so mistakes are visible, with a
  "wrong match?" link that opens a GitHub issue, and a way for a professor to ask for a review of what's shown.
- **No backend needed.** Like RMP, it all runs in the nightly or weekly GitHub Actions job and ships as static JSON.

## 3. Seat alerts

Since v0.4.0 the busiest courses are re-checked about every 10 minutes (`pipeline/live_seats.py`), and the Just opened
page can show a browser notification while it's open. Real alerts (email or a phone notification with the tab closed)
need somewhere to keep subscriptions and send from: Web Push with a small serverless backend (the same one as reviews)
fed by the live job. A cheaper step first: let students "watch" a section so the live job always re-checks it.

## 4. Better degree planning

- Hand-check the largest majors first (Computer Science, Psychology, Economics, Mechanical Engineering, Finance,
  Accountancy…) and fix what the importer gets wrong.
- Certificates. (Minors are on the degree checklist.)
- Paste your DARS report or transcript as text and have the browser fill in "My courses". The text would be read in
  the browser and never uploaded, so no NetID is involved.
- Check prerequisites against "My courses" instead of only showing the catalog's text.
- A four-year plan: drag courses into terms and see which requirements each term finishes.

## 5. Smaller improvements

- Several named schedules side by side ("plan A", "plan B if CS 225 fills"), each with its own share link.
- A "waitlist mode" in the schedule builder: plan around closed sections and see which ones to watch.
- Link renumbered courses to their old numbers so their GPA history carries over.
- Use the official academic calendar dates for the calendar export.
- The pipeline still exports each gen-ed course's section start times and days, so time filters could come back to the
  gen-ed finder as a link into the schedule builder rather than as separate filters (D14.5).
