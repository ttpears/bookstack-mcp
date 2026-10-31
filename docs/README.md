# Documentation

Start with the [README quick start](../README.md#quick-start), then choose the guide for your task.

| I want to… | Guide |
|---|---|
| Connect Claude Desktop, Claude Code, Codex, Gemini CLI, or LibreChat | [Client configuration](CLIENTS.md) |
| Deploy an internal container or HTTPS connector with Entra sign-in | [Deployment runbook](SETUP.md) |
| Look up environment variables and permission behavior | [Configuration reference](CONFIGURATION.md) |
| Search, paginate, edit safely, upload images, or export content | [Tools and recipes](TOOLS.md) |
| Diagnose startup, HTTP, OAuth, or BookStack errors | [Troubleshooting](TROUBLESHOOTING.md) |
| Develop and validate a change | [Contributing](../CONTRIBUTING.md) |
| Prepare, approve, verify, or recover a release | [Release runbook](RELEASING.md) |
| Understand HOL ownership, scanning, and score delivery | [HOL registry setup](HOL.md) |
| Understand data handling or report a vulnerability | [Privacy](../PRIVACY.md), [security](../SECURITY.md), [terms](../TERMS.md) |

## Choose a connection model

| Model | Caller authentication | BookStack identity | Typical use |
|---|---|---|---|
| Local stdio | Access to the local client/process | Configured token account | Desktop or CLI assistant |
| Internal Streamable HTTP | Trusted network or operator-supplied gateway | Configured token account | LibreChat on a private Docker network |
| HTTP with Entra OAuth | Entra bearer token on each MCP request | Shared read or write account selected by role | Remote connector |
| HTTP with request credentials enabled | Same HTTP/OAuth boundary as above | Caller's paired headers, with environment fallback | Client-managed BookStack credentials |

OAuth sign-in and BookStack content permissions are separate layers. Check the [credential matrix](CONFIGURATION.md#credentials-and-permissions) before sharing a server with users who should see different content.

## Version scope

These guides describe the current source on `main`. For an installed release, use the documentation at its Git tag, for example [v5.7.1](https://github.com/ttpears/bookstack-mcp/tree/v5.7.1). Documentation changes on `main` appear in the npm README at the next package publication.

Historical implementation notes are in the [release index](releases/README.md); downloadable assets and the full history are on [GitHub Releases](https://github.com/ttpears/bookstack-mcp/releases). Comments require BookStack v25.11+, and page revision summaries require v26.09+.
