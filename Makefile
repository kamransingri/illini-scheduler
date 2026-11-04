# Illini Scheduler — top-level tasks.
PY ?= python3
SUBJECTS ?= all
TERMS ?=

.PHONY: help data data-quick fetch pipeline export test test-py test-web lint typecheck dev build e2e serve clean

help:
	@echo "make data        - download sources, build data/illini.db, export web/public/data"
	@echo "make data-quick  - same, but only CS,MATH,STAT,RHET (fast)"
	@echo "make test        - pytest + vitest"
	@echo "make lint        - ruff + mypy + eslint + tsc"
	@echo "make dev         - Next.js dev server on :3000"
	@echo "make build       - static export to web/out"
	@echo "make e2e         - Playwright tests against the static build"

data:
	$(PY) -m pipeline.run --subjects $(SUBJECTS) $(if $(TERMS),--terms $(TERMS),)

data-quick:
	$(PY) -m pipeline.run --subjects CS,MATH,STAT,RHET

test: test-py test-web

test-py:
	$(PY) -m pytest -q

test-web:
	cd web && npm test --silent

lint: typecheck
	ruff check pipeline
	cd web && npm run lint --silent

typecheck:
	mypy
	cd web && npx tsc --noEmit

dev:
	cd web && npm run dev

build:
	cd web && npm run build

e2e:
	cd web && npm run e2e

serve:
	cd web && npx serve out -l 4173

clean:
	rm -rf data/illini.db web/out web/.next web/public/data
