# Security policy

## Supported versions

Security fixes target the latest published `bookstack-mcp` release. Upgrade to
the latest release before reporting a vulnerability that may already be fixed.
Changes on `main` are not available through npm until a release is published.

## Reporting a vulnerability

Please report vulnerabilities privately through
[GitHub's vulnerability reporting page](https://github.com/ttpears/bookstack-mcp/security/advisories/new).
If private reporting is unavailable, contact the
[maintainer](https://github.com/ttpears) to arrange a private reporting channel.
Do not put exploit details, API tokens, or private wiki content in a public issue.

Include the affected version, transport and configuration, reproduction steps,
expected and observed behavior, and the potential impact. Redact credentials and
private content from logs and examples. Test against a disposable BookStack
instance rather than a production wiki.

## Deployment guidance

- Keep write operations disabled unless the client is trusted to modify content.
- Use BookStack API tokens with the minimum necessary permissions.
- Protect HTTP deployments with authentication and HTTPS or a trusted internal
  connection. Configure allowed hosts and redact credential headers in proxies.
- Keep TLS certificate verification enabled.
- Restrict HTTP image sources with `BOOKSTACK_IMAGE_ALLOWED_HOSTS`, and enable
  local image file access only for trusted callers.
