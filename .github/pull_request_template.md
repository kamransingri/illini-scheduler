<!-- Title: "Area: what changes (#N)". Keep this short; the diff has the details. docs/ISSUES-AND-PRS.md -->

Closes #

- <!-- What students (or whoever works on the code) will notice, in a few bullets. -->

**Tests:** <!-- One line: what you ran and what you looked at. -->

<!-- **Different from the issue:** only if you changed the plan, and why. -->

- [ ] Branch is `type/short-name` (feature, fix, docs, chore, data, hotfix, release)
- [ ] `make lint` and `make test` pass, and Playwright for the pages this touches (`--workers=1`)
- [ ] CHANGELOG.md line under **Unreleased** if people will notice
- [ ] Docs updated where behaviour changed (LIMITATIONS, DECISIONS, API.md for new data fields)
- [ ] A change to a page: before and after screenshots at 1280px and 375px (docs/DESIGN.md Part 5)
- [ ] If an AI tool wrote most of this, the description says so (docs/AI-USE.md)
- [ ] If this ships a release: `make release V=…` and a "Release X.Y.Z" commit
