# Release checklist

1. Confirm CCF commit `492fc715d44ef7e8ee6e9c1cbe10f0b3f80398a2` remains publicly fetchable, or update and test Recall's pin.
2. Initialize Git, confirm the intended remote, and review every file with `git status`.
3. Run `npm ci`, `npm run doctor`, `npm run check`, `npm run test:e2e`, and `npm audit`.
4. Test one real API-mode project and one Codex-mode project using synthetic resume data.
5. Test Harvest onboarding, crawl status, shortlist, and workbook download from a clean machine.
6. Enable GitHub private vulnerability reporting and branch protection with required CI checks.
7. Confirm the MIT license and repository owner metadata are correct.
8. Tag `v0.1.0` only after CI passes on Linux, macOS, and Windows.
