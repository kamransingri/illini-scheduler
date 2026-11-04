# Decisions

Every judgment call made during the autonomous build, newest phase last.

## Phase 0

- **D0.1 Private repo, not public.** The build doc says `gh repo create --public`, but the owner asked for a
  *private* repository. Private wins. Note: GitHub Pages on a private repo needs a paid plan (Pro/Team);
  see PROGRESS.md "Needs a human".
- **D0.2 No GitHub remote from this session.** The cloud session's GitHub token is scoped to repositories
  attached at session start; `POST /user/repos` is refused (403, "sessions are bound to their configured
  repositories") and attaching another repo was refused by the session's permission policy. Work happens in a
  local git repo at `/home/user/illini-scheduler`; "create the repo and push" is in Needs a human.
- **D0.3 Network.** `courses.illinois.edu` and `www.ratemyprofessors.com` are denied by this session's egress
  policy (proxy 403 on CONNECT). `raw.githubusercontent.com`, `github.com`, PyPI and npm work. With no remote,
  the GitHub Actions fetch fallback cannot run here, so:
  - **Course Explorer data comes from Wade Fagen-Ulmschneider's `course-catalog/` mirror** in
    `wadefagen/datasets` (a CSV per term, scraped from the same Course Explorer API: CRN, section, type,
    times, days, room, building, instructors, enrollment status, description, degree attributes). This is
    real data, not a stand-in. The direct XML crawler (`pipeline/course_explorer.py --source api`) is also
    implemented and will be used automatically where the network allows (GitHub Actions).
  - **RMP** cannot be reached; the client is implemented and cached, the pipeline records
    "RMP unavailable", and the UI links out to RMP search instead of showing numbers.
- **D0.4 Python 3.13** is what the container has (doc says 3.11+). CI pins 3.11 to prove the floor.
- **D0.5 Web toolchain pins.** Next 15.5 (App Router, static export), React 19.1, TypeScript 5.9,
  Tailwind 4.1, Vitest 3.2, ESLint 9 + eslint-config-next 15. Newer majors (TS 7, ESLint 10, Next 16) were
  skipped to avoid compatibility churn. `@playwright/test` is pinned to 1.63.0 to match the pre-installed
  Chromium (no browser re-install).
- **D0.6 Generated data is not committed.** `data/raw/`, `data/illini.db` and `web/public/data/` are
  rebuilt by `make data` (local and in the nightly workflow), keeping the repo small. Small, real samples for
  the four reference courses are committed under `fixtures/` so tests run offline.
