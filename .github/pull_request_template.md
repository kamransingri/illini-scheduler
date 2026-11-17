## What changes

<!-- What someone using the site (or working on the code) will notice, and why. Screenshots for anything visual. -->

## How it was checked

<!-- Tests run, pages looked at (desktop and 375px), data checked. -->

## Checklist

- [ ] Branch is `type/short-name` (feature, fix, docs, chore, data, hotfix, release)
- [ ] `make lint` and `make test` pass
- [ ] Playwright passes for the pages this touches (`cd web && npx playwright test <spec> --workers=1`)
- [ ] CHANGELOG.md has a line under **Unreleased** if people will notice the change
- [ ] If this ships a release: `make release V=…` and a "Release X.Y.Z" commit (CONTRIBUTING.md, Releasing)
- [ ] README and docs updated where behaviour changed (LIMITATIONS, DECISIONS)
