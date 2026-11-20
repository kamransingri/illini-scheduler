# Illini Scheduler — top-level tasks.
PY ?= python3
SUBJECTS ?= all
TERMS ?=
SOURCE ?= auto
PYTEST_ARGS ?=

.PHONY: help availability-files data data-quick fetch pipeline export test test-quick test-py test-web test-mcp lint typecheck dev build e2e serve clean version release

help:
	@echo "make data        - download sources, build data/illini.db, export web/public/data"
	@echo "make data-quick  - same, but only CS,MATH,STAT,RHET (fast)"
	@echo "make export      - export web/public/data again from data/illini.db, without fetching"
	@echo "make test        - pytest + vitest (web and the MCP server in mcp/)"
	@echo "make test-quick  - only the unit tests for what changed since origin/main"
	@echo "make lint        - ruff + mypy + eslint + tsc"
	@echo "make dev         - Next.js dev server on :3000"
	@echo "make build       - static export to web/out"
	@echo "make e2e         - Playwright tests against the static build"
	@echo "make version     - check the version files agree and CHANGELOG.md covers the version"
	@echo "make release V=minor - next version (major|minor|patch|X.Y.Z-beta.N) in every file + CHANGELOG"

# The seat availability files come from the `availability` branch; offline, the pipeline reads course pages instead
availability-files:
	-bash tools/availability-files.sh fetch

data: availability-files
	$(PY) -m pipeline.run --subjects $(SUBJECTS) --source $(SOURCE) $(if $(TERMS),--terms $(TERMS),)

data-quick: availability-files
	$(PY) -m pipeline.run --subjects CS,MATH,STAT,RHET

export:
	$(PY) -m pipeline.run --export-only

test: test-py test-web test-mcp

test-quick:
	$(PY) -m tools.quick_test

# CI runs pytest in parallel (PYTEST_ARGS="-n auto", pytest-xdist); on a laptop it runs on one core
test-py:
	$(PY) -m pytest -q $(PYTEST_ARGS)

test-web:
	cd web && npm test --silent

test-mcp:
	cd mcp && npm test --silent

lint: typecheck
	ruff check pipeline tools
	cd web && npm run lint --silent

typecheck:
	mypy
	cd web && npx tsc --noEmit
	cd mcp && npx tsc --noEmit

dev:
	cd web && npm run dev

build:
	cd web && npm run build

e2e:
	cd web && npm run e2e

version:
	$(PY) -m tools.release check

release:
	@test -n "$(V)" || { echo "usage: make release V=major|minor|patch|X.Y.Z[-beta.N]"; exit 1; }
	$(PY) -m tools.release bump $(V)

serve:
	cd web && npx serve out -l 4173

clean:
	rm -rf data/illini.db web/out web/.next web/public/data
