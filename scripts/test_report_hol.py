import contextlib
import copy
import hashlib
import importlib.util
import io
import json
import unittest
import tempfile
from urllib.error import HTTPError
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

spec = importlib.util.spec_from_file_location("report_hol", Path(__file__).with_name("report-hol.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ReportingTests(unittest.TestCase):
    def test_delivery_summary_and_errors_exclude_response_bodies(self):
        failure = HTTPError('https://private.invalid', 403, 'private response details', {}, None)
        self.assertEqual(module.failure_detail(failure), 'HTTP 403')
        failure.close()
        self.assertEqual(module.failure_detail(RuntimeError('private exception')), 'RuntimeError')
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'summary.md'
            with contextlib.redirect_stdout(io.StringIO()):
                module.record_status('HOL CI report failed: HTTP 403', {'GITHUB_STEP_SUMMARY': str(path)})
            self.assertIn('HTTP 403', path.read_text())
            self.assertNotIn('private', path.read_text())

    def setUp(self):
        self.env = {
            "GITHUB_SERVER_URL": "https://github.com",
            "GITHUB_REPOSITORY": "ttpears/bookstack-mcp",
            "GITHUB_REF": "refs/heads/main", "GITHUB_EVENT_NAME": "push",
            "GITHUB_SHA": "a" * 40, "GITHUB_RUN_ID": "123",
            "ACTIONS_ID_TOKEN_REQUEST_URL": "https://oidc.example/token?api-version=2",
            "ACTIONS_ID_TOKEN_REQUEST_TOKEN": "request-secret",
        }
        self.scan = {
            "score": 100, "grade": "A", "tool_version": "3.58.0",
            "summary": {"findings": {"info": 1}},
            "findings": [{"description": "private finding text", "filePath": "private-path"}],
            "extra": "private source content",
        }

    def test_report_is_allowlisted_and_oidc_audience_binds_exact_body(self):
        requests = []

        def opener(request, timeout):
            requests.append(request)
            response = {"value": "oidc-secret"} if len(requests) == 1 else {"listings": 1}
            return io.BytesIO(json.dumps(response).encode())

        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            module.report(self.scan, self.env, opener)
        self.assertEqual(len(requests), 2)
        body = requests[1].data
        payload = json.loads(body)
        self.assertEqual(set(payload), {"schema", "repository", "commit_sha", "workflow_run_id", "scanner_version", "plugin_path", "score", "grade", "max_severity", "findings"})
        self.assertEqual(payload["findings"], {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 1})
        self.assertEqual(payload["max_severity"], "info")
        self.assertNotIn(b"private", body)
        audience = parse_qs(urlsplit(requests[0].full_url).query)["audience"][0]
        self.assertEqual(audience, "hol-plugin-ci-report:" + hashlib.sha256(body).hexdigest())
        self.assertEqual(requests[1].full_url, "https://hol.org/api/plugins/ci-reports")
        self.assertEqual(requests[1].get_method(), "POST")
        self.assertEqual(requests[1].get_header("Authorization"), "Bearer oidc-secret")
        self.assertEqual(output.getvalue(), "HOL CI report: sent (1 listing(s) updated)\n")

    def test_untrusted_context_never_requests_a_token(self):
        for field, value in [("GITHUB_EVENT_NAME", "pull_request"), ("GITHUB_REF", "refs/heads/feature"), ("GITHUB_REPOSITORY", "fork/bookstack-mcp")]:
            with self.subTest(field=field):
                env = {**self.env, field: value}
                with self.assertRaises(ValueError):
                    module.report(self.scan, env, lambda *args, **kwargs: self.fail("network access"))

    def test_invalid_summary_never_reaches_network(self):
        for value in [-1, "1", True]:
            scan = copy.deepcopy(self.scan)
            scan["summary"]["findings"]["high"] = value
            with self.assertRaises(ValueError):
                module.report(scan, self.env, lambda *args, **kwargs: self.fail("network access"))

    def test_hol_edge_filter_accepts_identified_reporter(self):
        requests = []

        def opener(request, timeout):
            requests.append(request)
            if len(requests) == 1:
                return io.BytesIO(b'{"value":"oidc-secret"}')
            agent = request.get_header("User-agent", "Python-urllib/3.12")
            if agent.startswith("Python-urllib"):
                raise HTTPError(request.full_url, 403, "Forbidden", {},
                                io.BytesIO(b"error code: 1010"))
            self.assertIn("bookstack-mcp", agent)
            self.assertIn("https://github.com/ttpears/bookstack-mcp", agent)
            return io.BytesIO(b'{"listings":1}')

        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            module.report(self.scan, self.env, opener)
        self.assertEqual(len(requests), 2)
        self.assertIn("sent (1 listing(s) updated)", output.getvalue())

    def test_receipt_must_confirm_an_updated_listing(self):
        for receipt in [{}, {"listings": 0}, {"listings": True}]:
            calls = []

            def opener(request, timeout):
                calls.append(request)
                return io.BytesIO(json.dumps({"value": "oidc-secret"} if len(calls) == 1 else receipt).encode())

            with self.assertRaises(ValueError):
                module.report(self.scan, self.env, opener)


if __name__ == "__main__":
    unittest.main()
