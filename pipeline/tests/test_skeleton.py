from pipeline import config


def test_paths_exist() -> None:
    assert config.ROOT.joinpath("Makefile").exists()
