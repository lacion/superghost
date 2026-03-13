# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in SuperGhost, please report it through a **GitHub private Security Advisory**:

[Report a vulnerability](https://github.com/lacion/superghost/security/advisories/new)

Do not open a public issue for security vulnerabilities.

## Response Timeline

We'll respond as soon as we can. SuperGhost is a solo-maintainer project, so there's no hard SLA, but security reports are treated as a priority.

## Scope

**Security issues** (report via Security Advisory):

- Secret leakage in cache files or metadata
- Cache poisoning attacks
- Dependency vulnerabilities with exploitable impact
- Unauthorized access or privilege escalation

**Regular bugs** (report via [GitHub Issues](https://github.com/lacion/superghost/issues)):

- Crash bugs or unexpected errors
- Config parsing errors
- Incorrect test results
- CLI usability issues

If you're unsure whether something is a security issue, err on the side of caution and use the Security Advisory.

## Supported Versions

Security fixes are applied to the **latest release only**. There is no backporting to older versions. We recommend always using the latest version of SuperGhost.
