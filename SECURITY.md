# Security policy

## Reporting

Do not open a public issue for a vulnerability or include real resume data, API keys, tokens, or crawler output in any report. Use GitHub's private vulnerability reporting for this repository. If private reporting is not enabled yet, the repository owner must enable it before public release.

Include the affected version, reproduction steps, impact, and a minimal proof of concept with synthetic data. Maintainers should acknowledge a report within seven days.

## Supported version

Security fixes target the latest release on the default branch.

## Local security model

Recall's companion services are intended only for `127.0.0.1`. Exposing them through port forwarding, a public development server, tunnel, reverse proxy, or permissive container networking is unsupported.
