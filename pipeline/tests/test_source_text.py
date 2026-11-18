from pipeline.config import ROOT

CONTROL = {chr(c) for c in range(32)} - {"\n", "\r", "\t"}


def test_no_control_characters_in_source_docs_or_hand_kept_data():
    """A regex once held two backspace characters where "\\b" was meant (catalog_import's word-boundary pattern), so it
    could never match, and the same slip reached DECISIONS.md. None of these files ever needs a control character."""
    files = [*ROOT.glob("pipeline/**/*.py"), *ROOT.glob("tools/*.py"), *ROOT.glob("*.md"), *ROOT.glob("docs/*.md"),
             *ROOT.glob("data/*.csv"), *ROOT.glob("data/*.txt"), *ROOT.glob("data/**/*.yaml"),
             *ROOT.glob(".github/workflows/*.yml"),
             *(p for d in ("lib", "components", "app", "tests") for p in (ROOT / "web" / d).glob("**/*.ts*"))]
    bad = []
    for p in files:
        for i, line in enumerate(p.read_text(encoding="utf-8").splitlines(), 1):
            if CONTROL & set(line):
                bad.append(f"{p.relative_to(ROOT)}:{i}")
    assert len(files) > 300 and bad == []
