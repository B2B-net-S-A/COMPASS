#!/usr/bin/env python3
"""Deploy staging through the locked exact-SHA helper with split Coolify tokens."""

from __future__ import annotations

import argparse
import os
import sys
import urllib.parse
from pathlib import Path

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
STANDARDS_TOOLS = REPOSITORY_ROOT / ".standards" / "tools"
sys.path.insert(0, str(STANDARDS_TOOLS))

from _common import ValidationError, require_sha, write_json  # noqa: E402
from coolify_exact_sha import (  # noqa: E402
    CoolifyClient,
    DeploymentResult,
    _read_application_sha,
    deploy_exact_sha,
    write_github_output,
)


class SplitTokenCoolifyClient:
    """Route safe reads and mutations to separately scoped API clients."""

    def __init__(self, base_url: str, mutation_token: str, read_token: str) -> None:
        if not mutation_token:
            raise ValidationError("COOLIFY_TOKEN is required")
        if not read_token:
            raise ValidationError("COOLIFY_READ_TOKEN is required")
        if mutation_token == read_token:
            raise ValidationError("Coolify read and mutation tokens must be different")
        self._mutation = CoolifyClient(base_url, mutation_token)
        self._read = CoolifyClient(base_url, read_token)

    def get_application(self, application_uuid: str) -> dict:
        return self._read.get_application(application_uuid)

    def deployment_status(self, deployment_id: str) -> str:
        return self._read.deployment_status(deployment_id)

    def set_release_metadata(self, application_uuid: str, sha: str, deployed_at: str) -> None:
        self._mutation.set_release_metadata(application_uuid, sha, deployed_at)

    def set_sha(self, application_uuid: str, sha: str) -> None:
        require_sha(sha)
        endpoint = f"/applications/{urllib.parse.quote(application_uuid, safe='')}"
        self._mutation.request("PATCH", endpoint, {"git_commit_sha": sha})
        confirmed = _read_application_sha(self.get_application(application_uuid), allow_missing=False)
        if confirmed != sha:
            raise ValidationError("Coolify did not persist the requested exact git_commit_sha")

    def trigger_deploy(self, application_uuid: str, method: str = "GET") -> str:
        return self._mutation.trigger_deploy(application_uuid, method)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--application-uuid", required=True)
    parser.add_argument("--sha", required=True)
    parser.add_argument("--deploy-method", choices=("GET", "POST"), default="GET")
    parser.add_argument("--deployment-timeout", type=float, default=1800)
    parser.add_argument("--poll-interval", type=float, default=5)
    parser.add_argument("--deployed-at")
    parser.add_argument("--state-output", type=Path)
    parser.add_argument("--github-output", type=Path)
    args = parser.parse_args(argv)

    try:
        client = SplitTokenCoolifyClient(
            args.base_url,
            os.environ.get("COOLIFY_TOKEN", ""),
            os.environ.get("COOLIFY_READ_TOKEN", ""),
        )

        def record_started(started: DeploymentResult) -> None:
            if args.state_output:
                write_json(
                    args.state_output,
                    {
                        "application_uuid": started.application_uuid,
                        "requested_sha": started.requested_sha,
                        "previous_sha": started.previous_sha,
                        "deployment_id": started.deployment_id,
                        "already_target": started.already_target,
                    },
                )
            if args.github_output:
                write_github_output(args.github_output, started)

        deploy_exact_sha(
            client,
            application_uuid=args.application_uuid,
            sha=args.sha,
            deploy_method=args.deploy_method,
            deployment_timeout=args.deployment_timeout,
            poll_interval=args.poll_interval,
            on_started=record_started,
            deployed_at=args.deployed_at,
        )
    except ValidationError as exc:
        print(f"staging exact-SHA deploy failed: {exc}", file=sys.stderr)
        return 1

    print(f"staging exact-SHA deploy succeeded: application={args.application_uuid} sha={args.sha}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
