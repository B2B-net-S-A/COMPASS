import importlib.util
import pathlib
import unittest

spec = importlib.util.spec_from_file_location("availability_setup", pathlib.Path(__file__).with_name("configure-nexus-availability.py"))
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)


class ApplicationScopeTests(unittest.TestCase):
    def test_repository_transports(self):
        for name in ["artur-t-96/Nexus", "https://github.com/artur-t-96/Nexus.git", "git@github.com:artur-t-96/Nexus.git"]:
            self.assertEqual(setup.repository_name(name), "artur-t-96/nexus")

    def test_ignores_preview_and_other_repositories(self):
        production = {"uuid": "production", "git_repository": "artur-t-96/Nexus", "git_branch": "main"}
        preview = {**production, "uuid": "preview", "git_branch": "preview"}
        foreign = {**production, "uuid": "foreign", "git_repository": "someone/Nexus"}
        self.assertEqual(setup.nexus_application([preview, foreign, production]), production)

    def test_ambiguous_or_missing_target_fails_before_configuration(self):
        app = {"uuid": "one", "git_repository": "artur-t-96/Nexus", "git_branch": "main"}
        for rows in [[], [app, {**app, "uuid": "two"}]]:
            with self.assertRaises(ValueError):
                setup.nexus_application(rows)


if __name__ == "__main__":
    unittest.main()
