#!/usr/bin/env python3
"""Report only scanner summary fields using HOL's GitHub OIDC CI contract.

Contract: hashgraph-online/hol-guard, src/codex_plugin_scanner/hol_ci_report.py.
The v1.2.813 action advertises reporting, but its 3.58.0 wheel omits that code.
Keep this bridge until the provenance-verified scanner release implements it.
"""
import hashlib
import json
import os
import sys
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen

SEVERITIES = ("critical", "high", "medium", "low", "info")


def record_status(message, env):
    print(message)
    summary = env.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as output:
            output.write("\n### HOL registry delivery\n\n" + message + "\n")


def failure_detail(error):
    return f"HTTP {error.code}" if isinstance(error, HTTPError) else type(error).__name__


def report(scan, env, opener=urlopen):
    if (env.get("GITHUB_SERVER_URL") != "https://github.com"
            or env.get("GITHUB_REF") != "refs/heads/main"
            or env.get("GITHUB_EVENT_NAME") not in {"push", "schedule", "workflow_dispatch"}
            or env.get("GITHUB_REPOSITORY") != "ttpears/bookstack-mcp"):
        raise ValueError("Reporting requires this repository's trusted main run")
    score = scan["score"]
    counts = {s: scan["summary"]["findings"].get(s, 0) for s in SEVERITIES}
    if (type(score) is not int or not 0 <= score <= 100
            or any(type(n) is not int or n < 0 for n in counts.values())
            or scan["grade"] not in {"A", "B", "C", "D", "E", "F"}
            or not isinstance(scan["tool_version"], str)):
        raise ValueError("Invalid scanner summary")
    payload = {
        "schema": "hol.plugin-ci-report.v1",
        "repository": env["GITHUB_REPOSITORY"],
        "commit_sha": env["GITHUB_SHA"],
        "workflow_run_id": env["GITHUB_RUN_ID"],
        "scanner_version": scan["tool_version"],
        "plugin_path": "",
        "score": score,
        "grade": scan["grade"],
        "max_severity": next((s for s, n in counts.items() if n), "none"),
        "findings": counts,
    }
    body = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
    audience = "hol-plugin-ci-report:" + hashlib.sha256(body).hexdigest()
    token_url = env["ACTIONS_ID_TOKEN_REQUEST_URL"]
    separator = "&" if "?" in token_url else "?"
    token_request = Request(
        token_url + separator + "audience=" + quote(audience, safe=""),
        headers={"Authorization": "Bearer " + env["ACTIONS_ID_TOKEN_REQUEST_TOKEN"]},
    )
    print("HOL CI report: requesting GitHub identity", file=sys.stderr, flush=True)
    with opener(token_request, timeout=15) as response:
        token = json.load(response)["value"]
    request = Request(
        "https://hol.org/api/plugins/ci-reports", data=body, method="POST",
        headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"},
    )
    print("HOL CI report: submitting summary to HOL", file=sys.stderr, flush=True)
    with opener(request, timeout=15) as response:
        receipt = json.load(response)
    listings = receipt.get("listings")
    if type(listings) is not int or listings < 1:
        raise ValueError("HOL did not confirm a listing update")
    record_status(f"HOL CI report: sent ({listings} listing(s) updated)", env)


if __name__ == "__main__":
    try:
        report(json.loads(Path(sys.argv[1]).read_text()), os.environ)
    except Exception as error:
        # Upstream responses and token values must never reach job logs.
        detail = failure_detail(error)
        record_status(f"HOL CI report failed: {detail}; registry delivery is unconfirmed.", os.environ)
        print(f"::warning title=HOL registry reporting::Delivery not confirmed ({detail}).")
        sys.exit(1)
