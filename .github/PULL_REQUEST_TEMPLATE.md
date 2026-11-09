## What does this change?

<!-- One or two sentences. Link the issue: Closes #123 -->

## Why?

<!-- The problem this solves, or the issue discussion that agreed on the approach. -->

## How was it tested?

- [ ] `npm run build` passes
- [ ] `npm test -w web` passes
- [ ] Tried it in the browser (desktop and mobile if the UI changed)

## Checklist

- [ ] User-visible strings are wrapped in `t()` and translated in `web/src/lib/en.ts`
- [ ] New request inputs are validated with zod and SQL is parameterized
- [ ] New migrations are a new numbered file and were not edited after being applied
- [ ] Docs updated (README, CONTRIBUTING or CHANGELOG) when behavior changed
- [ ] Screenshots or a short recording attached for UI changes
