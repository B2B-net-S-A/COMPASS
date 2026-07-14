#!/usr/bin/env python3
"""Unit tests for staging Coolify split-token routing."""

from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "staging-coolify-exact-sha.py"
SPEC = importlib.util.spec_from_file_location("staging_coolify_exact_sha", SCRIPT)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

TARGET_SHA = "a" * 40
PREVIOUS_SHA = "b" * 40


class FakeCoolifyClient:
    events: list[tuple[str, str]] = []
    application_sha = PREVIOUS_SHA

    def __init__(self, _base_url: str, token: str) -> None:
        self.token = token

    def get_application(self, _application_uuid: str) -> dict:
        self.events.append(("get_application", self.token))
        return {"git_commit_sha": self.application_sha}

    def deployment_status(self, _deployment_id: str) -> str:
        self.events.append(("deployment_status", self.token))
        return "finished"

    def set_release_metadata(self, _application_uuid: str, _sha: str, _deployed_at: str) -> None:
        self.events.append(("patch_release_metadata", self.token))

    def request(self, method: str, _endpoint: str, payload=None) -> dict:
        self.events.append((method.lower(), self.token))
        if method == "PATCH" and payload and "git_commit_sha" in payload:
            type(self).application_sha = payload["git_commit_sha"]
        return {}

    def trigger_deploy(self, _application_uuid: str, _method: str = "GET") -> str:
        self.events.append(("trigger_deploy", self.token))
        return "deployment-1"


class SplitTokenCoolifyClientTest(unittest.TestCase):
    def setUp(self) -> None:
        FakeCoolifyClient.events = []
        FakeCoolifyClient.application_sha = PREVIOUS_SHA
        self.original_client = MODULE.CoolifyClient
        MODULE.CoolifyClient = FakeCoolifyClient

    def tearDown(self) -> None:
        MODULE.CoolifyClient = self.original_client

    def test_routes_reads_and_mutations_to_separate_tokens(self) -> None:
        client = MODULE.SplitTokenCoolifyClient("https://coolify.example.com", "mutation", "read")
        MODULE.deploy_exact_sha(
            client,
            application_uuid="compass-staging",
            sha=TARGET_SHA,
            deployment_timeout=1,
            poll_interval=0,
            deployed_at="2026-07-14T12:34:56Z",
        )

        read_events = {"get_application", "deployment_status"}
        mutation_events = {"patch_release_metadata", "patch", "trigger_deploy"}
        self.assertTrue(FakeCoolifyClient.events)
        self.assertGreaterEqual(sum(event in mutation_events for event, _ in FakeCoolifyClient.events), 3)
        self.assertTrue(all(token == "read" for event, token in FakeCoolifyClient.events if event in read_events))
        self.assertTrue(
            all(token == "mutation" for event, token in FakeCoolifyClient.events if event in mutation_events)
        )
        self.assertGreaterEqual(sum(event == "get_application" for event, _ in FakeCoolifyClient.events), 3)
        self.assertEqual(sum(event == "deployment_status" for event, _ in FakeCoolifyClient.events), 1)

    def test_rejects_identical_tokens_before_client_creation(self) -> None:
        with self.assertRaisesRegex(MODULE.ValidationError, "must be different"):
            MODULE.SplitTokenCoolifyClient("https://coolify.example.com", "same", "same")
        self.assertEqual(FakeCoolifyClient.events, [])


if __name__ == "__main__":
    unittest.main()
