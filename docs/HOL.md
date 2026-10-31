# HOL registry setup

BookStack MCP is listed in the [HOL Registry](https://hol.org/registry/plugins/ttpears%2Fbookstack-mcp)
following the merged [catalog submission](https://github.com/hashgraph-online/awesome-ai-plugins/pull/601).
The catalog maintainers requested ownership verification and recommended scanner CI.

## Verify ownership

Open [the BookStack MCP ownership claim](https://hol.org/guard/plugins?claim=ttpears%2Fbookstack-mcp),
choose **Continue with GitHub**, and sign in with the account that maintains
`ttpears/bookstack-mcp`. HOL's invitation states that this requests `read:user`
and `user:email`, without repository write access. Check the consent screen
before completing it.

After verification, confirm the owner-verified badge and author dashboard at
[HOL Guard plugins](https://hol.org/guard/plugins). This is an account sign-in
step; adding repository metadata or running CI does not complete it.

## Continuous scans and registry reporting

The [HOL Guard workflow](../.github/workflows/hol-guard.yml) runs on main pushes,
pull requests, a weekly schedule, and manual dispatch. It scans local repository
content with an immutable action SHA, verified scanner provenance, no persisted
checkout credentials, and a minimum score of 95 with medium-or-higher findings
blocking CI. Plugin policy links and synchronized versions are checked first.
Scanner reports are retained as downloadable GitHub Actions artifacts for
14 days, including reports from failed scans.

PR scans have only `contents: read`. After the scan passes on `main`, a separate
job uses GitHub OIDC (`id-token: write`) to report the score, grade, finding counts,
scanner version, commit, workflow run, and scanned folder to HOL. It sends no
source code, file contents, or finding text. Online probing, external analyzers,
automatic catalog submissions, and PR comments remain disabled.

The v1.2.813 action advertises reporting but its packaged scanner 3.58.0 does not
implement that input. A small repository script uses HOL's published OIDC
contract to send only allowlisted summary fields and require a delivery receipt.
It can be removed when a verified scanner release includes native reporting.
The reporter identifies itself with a project-specific HTTP user agent because
HOL's edge filter rejects Python's default user agent with HTTP 403 (code 1010).

Check **Report summary to HOL and verify receipt** for a `sent` receipt and the
number of listings updated. Reporting failures remain visible in the reporting
job but do not change the scanner verdict or fail the overall workflow. A green
workflow without a delivery receipt does not establish registry delivery.
Delivery status also appears in the job summary; failures produce a warning
without copying upstream response bodies or credentials into GitHub.
Retry a temporary delivery
failure by manually running the workflow on `main`; investigate persistent errors
using the logged status, without adding long-lived credentials.

The README's trust badge reads HOL's registry score. Ownership verification and
CI report delivery are separate checks; neither a local score nor a passing
workflow proves that the owner claim has completed.

## Releases

Runtime/package changes use synchronized npm, Claude, Codex, Cursor, and Gemini versions,
including exact npm package pins in the plugin launchers.
Merging a version bump creates the release tag through CI. The release workflow
then waits for the repository's protected `release` environment approval before
publishing npm, container images, the GitHub release, and the MCPB bundle.
Approve the specific validated run in GitHub; keep the environment protection
and OIDC trusted publishing in place. Workflow-only HOL configuration changes
do not require an npm release.

## Directory pre-flight and public scores

The [directory pre-flight](https://hol.org/plugins/preflight?repo=ttpears%2Fbookstack-mcp)
checks the current default-branch commit against published Claude, Codex, and
Cursor directory rules. It is separate from the scanner and the public registry's
indexed snapshot. A passing pre-flight does not refresh that snapshot, deliver a
CI report, or mean a directory has accepted the plugin.

Plugin launchers pin the exact published npm version, and Gemini and Cursor reuse
the small icon in `assets/logo.png`. Keep individual plugin files below 5 MiB.
The native Cursor manifest shares `.mcp.json` with Codex. A lockfile can trigger
manual dependency review in the Claude pre-flight; keep the lockfile for
reproducible builds rather than removing it to change that review result.

If the public page reports findings already fixed in the repository, compare its
displayed version and source commit with the current manifest and the latest
trusted-main scan. In the owner dashboard, **Directory and release evidence**
shows the pre-flight commit separately from **CI scanner reports**. An empty CI
report list means there is no accepted report visible there; check the workflow's
delivery receipt and any authorization failure before claiming scores updated.
