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

PR scans have only `contents: read`. After the scan passes on `main`, a separate
job uses GitHub OIDC (`id-token: write`) to report the score, grade, finding counts,
scanner version, commit, workflow run, and scanned folder to HOL. It sends no
source code, file contents, or finding text. Online probing, external analyzers,
automatic catalog submissions, and PR comments remain disabled.

The v1.2.813 action advertises reporting but its packaged scanner 3.58.0 does not
implement that input. A small repository script uses HOL's published OIDC
contract to send only allowlisted summary fields and require a delivery receipt.
It can be removed when a verified scanner release includes native reporting.

Check **Report summary to HOL and verify receipt** for a `sent` receipt and the
number of listings updated. Reporting failures fail the reporting job separately
from the scan. Retry a temporary delivery
failure by manually running the workflow on `main`; investigate persistent errors
using the logged status, without adding long-lived credentials.

The README's trust badge reads HOL's registry score. Ownership verification and
CI report delivery are separate checks; neither a local score nor a passing
workflow proves that the owner claim has completed.

## Releases

Runtime/package changes use synchronized npm, Claude, Codex, and Gemini versions.
Merging a version bump creates the release tag through CI. The release workflow
then waits for the repository's protected `release` environment approval before
publishing npm, container images, the GitHub release, and the MCPB bundle.
Approve the specific validated run in GitHub; keep the environment protection
and OIDC trusted publishing in place. Workflow-only HOL configuration changes
do not require an npm release.
