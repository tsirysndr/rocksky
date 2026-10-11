import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from subprocess import CompletedProcess

spec = importlib.util.spec_from_file_location("check_appimage", Path(__file__).with_name("check-appimage.py"))
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)


class AppImageChecks(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        for name in ("AppRun", "AppRun.wrapped", "usr/bin/rocksky-desktop"):
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("#!/bin/sh\nexit 0\n")
            path.chmod(0o755)
        for name in ("libfribidi.so.0", "libharfbuzz.so.0"):
            path = self.root / "usr/lib" / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("fixture")

    def test_distributed_files_are_accessible(self):
        self.assertEqual(checker.check(self.root), [])

    def test_catalog_permission_regression(self):
        (self.root / "AppRun.wrapped").chmod(0o750)
        self.assertTrue(any("AppRun.wrapped" in error for error in checker.check(self.root)))

    def test_missing_library_is_rejected(self):
        (self.root / "usr/lib/libfribidi.so.0").unlink()
        self.assertTrue(any("libfribidi.so.0" in error for error in checker.check(self.root)))

    def test_private_packaged_directory_is_rejected(self):
        (self.root / "usr/bin").chmod(0o700)
        self.assertIn("usr/bin: directory is inaccessible to other users", checker.check(self.root))

    def test_glibc_baseline_cannot_increase_silently(self):
        (self.root / "usr/bin/rocksky-desktop").write_bytes(b"\x7fELFfixture")
        with patch.object(checker.subprocess, "run", return_value=CompletedProcess([], 0, "GLIBC_2.38")):
            self.assertTrue(any("GLIBC_2.38" in error for error in checker.check(self.root)))


if __name__ == "__main__":
    unittest.main()
