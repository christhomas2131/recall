# Contributing

## Setup

Use Node.js 20.19+ or 22.12+, then run `npm ci` and `npm run doctor`.

Create a focused branch and keep unrelated formatting out of the change. Do not commit real resumes, API keys, crawler workspaces, generated workbooks, or browser data.

## Required checks

```sh
npm run check
npm run test:e2e
```

Bug reports need reproduction steps, expected behavior, actual behavior, operating system, Node version, and the redacted output of `npm run doctor`. Security reports follow [SECURITY.md](SECURITY.md), not public issues.
