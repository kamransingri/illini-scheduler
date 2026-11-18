# r/UIUC signal (issue #14)

What students say about courses and professors on r/UIUC, next to RMP: a rating with its comment count and years, two
or three short quotes that link to the thread (never a username), and tags such as "curved". The pipeline is built
and tested (`pipeline/reddit.py`, `.github/workflows/reddit.yml`), but **nothing runs and nothing is shown yet**:

1. **Reddit API access.** Since late 2025 Reddit issues OAuth tokens only to apps it has approved under its
   [Responsible Builder Policy](https://www.reddit.com/r/redditdev/comments/1oug31u/introducing_the_responsible_builder_policy_new/).
   The [Data API Terms](https://redditinc.com/policies/data-api-terms) also limit use to the approved use case, so
   the application has to describe all of it, including the model that reads the comments (below).
2. **The labelled check.** About 200 hand-labelled comments must agree well enough with the extraction before a
   number appears on the site (step 5).

The course-page column is a separate pull request after step 5, because the check may change which fields are worth
showing.

## Switching it on (repository owner)

1. **Apply for Data API access** from Reddit's developer support form, as the person responsible for the app (Reddit
   asks for contact details). A description that covers the whole use:

   > Illini Scheduler (github.com/kamransingri/illini-scheduler) is a free, non-commercial, open-source course
   > planner for University of Illinois students, published as a static site. Once a week it would search r/UIUC for
   > course codes (such as "CS 225") and the surnames of the courses' instructors, read the matching public threads
   > through the Data API with an app-only OAuth token, and keep them in a private cache that is never published. A
   > language model (Anthropic's Claude Haiku) reads each comment that names a course and returns a few fixed fields
   > (teaching and difficulty ratings, workload, curve, attendance) with the sentence supporting each. The site would
   > show per-course and per-professor averages with comment counts and years, and up to three short quotes linking
   > to the comment on Reddit. No usernames are stored or shown, deleted and removed comments are dropped on every
   > run, the data is not used to train any model, and requests stay within the rate limits (about 2,000 a week).

2. **Once approved**, create the app (type "script" or as Reddit instructs) and add to the repository's Settings ->
   Secrets and variables -> Actions:
   - secrets `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, and `REDDIT_SALT` (any long random string; it keeps author
     hashes stable between runs);
   - the variable `REDDIT_USER_AGENT`, in Reddit's format: `<platform>:<app id>:<version> (by /u/<account>)`.
3. **Add `ANTHROPIC_API_KEY`** as a secret for the extraction step. Cost, assuming about 600 tokens in and 450 out
   per comment at Claude Haiku 5.5's Message Batches price ($0.05 and $0.25 per million tokens): about **$3 for the
   first 20,000 comments**, then a few cents a week. Without the key the workflow collects but extracts nothing.
4. **Run the workflow** (Actions -> Reddit signal -> Run workflow). The first runs work through about 3,000
   undergraduate courses and their instructors, busiest first, within 30 minutes a run; later runs search only
   what's new since the last search.
5. **Validate.** Download the cache (or run locally with the same secrets), then:

   ```sh
   python -m pipeline.reddit sample --out reddit-labels.csv     # 200 comments from CS 124, MATH 221, STAT 107, RHET 105
   # fill in the label_* columns by hand: about_teaching (yes/no), teaching and difficulty (1-5), recommend, curve
   python -m pipeline.reddit agreement --labels reddit-labels.csv
   python -m pipeline.reddit aggregate                         # also prints the correlation with RMP and GPA
   ```

   Record the numbers in the pull request that adds the column. Only fields that agree well enough are shown.

## How it works

`python -m pipeline.reddit collect | extract | aggregate | sample | agreement | status`

- **Collect.** Searches r/UIUC with application-only OAuth, at most one request every 0.65 s (Reddit allows 100 a
  minute) and slower when Reddit's rate-limit headers say so. A thread is read again only when its comment count
  changes. Usernames are replaced by a salted hash before anything is written. Every run asks Reddit (`/api/info`, 100
  ids a request) which cached posts and comments are now deleted or removed, and drops them. "Load more" replies
  aren't fetched. The cache lives in `data/raw/reddit/` and the Actions cache; it is never committed.
- **Attribute.** A comment names a course by code ("CS 225", "cs225", "CS-225"), by one of the site's nicknames that
  means exactly one course ("calc 2"; "calc 1" could be MATH 220 or 221, so it doesn't count), or by a bare number in
  a thread about one subject ("225" under "CS 225 with X or Y?"). A comment with no course of its own takes its
  thread's; with none at all it's skipped, and so is a comment listing more than three courses (a schedule). A
  professor is matched only as the surname of someone who teaches or taught a course the comment names, so "Lee
  is great" on its own never matches anyone. Surnames under six letters must be capitalized ("Long explains well",
  not "long homework"), and two teachers of the course with the same surname means no professor.
- **Extract.** Claude Haiku 5.5 (`claude-haiku-5-5`) through the Message Batches API, with a JSON schema, low effort
  and a system prompt that treats the comment as data. Fields: about_teaching, teaching 1-5, difficulty 1-5, hours a
  week, would recommend, exam style, curve, attendance, each with its quote. A value whose quote isn't in the comment
  word for word is dropped: no quote, no number. Refusals and errors are retried on the next run; a comment is sent
  again only when its text changes.
- **Aggregate.** Per course, and per professor and course: one comment per author per thread (their newest), a
  weight of `0.5 ^ (age in years / 2) * (1 + 0.1 * ln(1 + upvotes))`, and shrinkage toward the course mean (campus
  mean for the course itself) with k = 5 weighted comments, like the RMP prior (DECISIONS D13.18). A rating needs 3
  comments. Tags need 2 comments that say so. Output: `reddit-ratings.json`, uploaded as a workflow artifact.

## Rules

- Non-commercial, within rate limits, short quotes with links, and only the approved use case. Not used to train
  any model.
- No usernames stored or shown. Deleted and removed content dropped every run.
- Every number shows its comment count and years; Reddit, RMP and GPA stay visibly separate.
- When the column ships: the sentence behind each match, and a "wrong match?" link that opens a GitHub issue.
