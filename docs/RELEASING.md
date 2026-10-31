# Release runbook

[Documentation index](README.md) · [Contributing](../CONTRIBUTING.md) · [Deployment](SETUP.md)

Releases are published by GitHub Actions after a maintainer approves the protected `release` environment. Never run `npm publish` locally, add an `NPM_TOKEN`, or remove the approval protection to work around a failed publish.

## Decide whether a release is needed

Runtime behavior, security fixes, dependency upgrades, and package/bundle changes normally need a semantic version bump. Documentation-only or workflow-only changes normally do not. The GitHub README updates on merge; the npm README updates at the next publication. If a documentation refresh specifically needs to reach npm immediately, prepare a deliberate patch release through this process.

Choose patch/minor/major according to compatibility impact. Describe resulting behavior and migration steps in release notes; a merged change is not necessarily published.

## Prepare the PR

1. Update `package.json` and `package-lock.json` together, for example `npm version patch --no-git-tag-version` for a patch release.
2. Set the exact same version in `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, `.cursor-plugin/plugin.json`, and `gemini-extension.json`. Update the `bookstack-mcp@X.Y.Z` launcher arguments in `.mcp.json`, the Claude manifest, and the Gemini extension to that version too. The MCPB builder reads `package.json`. Refresh versioned client examples when changing the recommended release.
3. Add `docs/releases/vX.Y.Z.md` when useful, and link it from the [release-note index](releases/README.md). GitHub's workflow also generates notes from merged changes.
4. Run validation:

```bash
npm ci
npm run type-check
npm test
npm run build
python3 -m unittest discover -s scripts -p 'test_report_hol.py'
node scripts/check-plugin.mjs
npm audit
npm pack --dry-run
```

Review package contents for private/unintended files. For packaging changes, also run `node scripts/build-mcpb.mjs` and inspect the generated bundle/manifest. Output bundles are ignored by Git.

Open a PR explaining behavior, compatibility, and validation. Confirm CI/HOL Guard and the container preview before merge. Same-repository previews are amd64 testing images; they do not publish npm.

## Tag and approve

After merge, [CI](../.github/workflows/ci.yml) runs type checks, tests, and a build. Its `tag` job compares `package.json`'s version to existing tags. If `vX.Y.Z` is absent, it pushes an annotated tag using `RELEASE_PAT` so downstream workflows trigger. **Do not tag manually in the normal flow.**

The [Release workflow](../.github/workflows/release.yml) runs on `v*` tags. Both the npm/GitHub and container jobs use the protected `release` environment. In the specific validated run, a maintainer selects **Review deployments → Approve and deploy**. Repository write access does not necessarily let an integration approve this environment: HTTP 403 can require the maintainer's signed-in GitHub review.

Approval unblocks publishing; a tag alone is not publication. Keep the gate, trusted-publisher configuration, and OIDC provenance.

## Published outputs

| Output | Behavior |
|---|---|
| npm `bookstack-mcp@X.Y.Z` | Node 22 and current npm CLI; `npm publish --access public --provenance` with GitHub OIDC trusted publishing |
| GitHub release `vX.Y.Z` | Generated notes and `bookstack-mcp-X.Y.Z.mcpb` attachment |
| GHCR container | Node 24; Linux amd64 and arm64; tags `X.Y.Z`, `X.Y`, `latest` |

Publishing jobs run separately. Check every output rather than inferring success from one job. These commands inspect metadata without publishing; replace `X.Y.Z` first:

```bash
npm view bookstack-mcp version dist-tags --json
gh release view vX.Y.Z --repo ttpears/bookstack-mcp
docker buildx imagetools inspect ghcr.io/ttpears/bookstack-mcp:X.Y.Z
```

Confirm the intended npm version/dist-tag, correct MCPB asset, both image architectures, and successful workflow jobs. For runtime changes, test the released package/image against a disposable wiki. For MCPB changes, test installation in the supported desktop client.

## When a release stalls

| Symptom | Next step |
|---|---|
| CI passes but no tag | Inspect `tag` logs, version synchronization, and existing tags. Verify `RELEASE_PAT` validity/permissions; default `GITHUB_TOKEN` cannot trigger downstream workflows |
| Tag exists, run waiting | Obtain the specific run's required `release` environment review |
| Trusted publishing rejected | Check npm's trusted publisher matches this repo and `release.yml`, OIDC permissions, and CLI/runtime versions. Do not substitute a permanent npm token |
| npm succeeds, GitHub/MCPB fails | Inspect the failed step and existing outputs. Rerunning the entire job will hit the immutable published npm version; do not blindly rerun its publish step |
| Container fails after npm succeeds | Repair the container-specific failure and rerun only the appropriate failed job; verify tags/architectures afterward |

Never move an existing release tag or assume a published npm version can be overwritten. For a partial release, inspect existing outputs and repair missing ones through a reviewed workflow when possible, or prepare a new patch version if the package must change. A rollback restores a deployment; it does not erase published packages or undo wiki edits. See [deployment rollback](SETUP.md#upgrade-and-rollback).

## Other automated checks

HOL scans, ownership verification, and accepted report receipts are separate from publishing and from one another. See [HOL setup](HOL.md). A non-blocking reporting failure must not be described as successful delivery.
