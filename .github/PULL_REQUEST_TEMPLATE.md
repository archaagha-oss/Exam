<!--
  Match the structure used by the Stage 0 / Stage 1 PRs. Reviewers should
  be able to read top-to-bottom and know what changed, why it's safe, and
  what they need to do.
-->

## Summary

<!-- 1–3 sentences. The "why", not the "what" — file diffs already say what. -->

## Audit / decision links

<!--
  If this closes an audit finding (docs/00-audit.md §8 P0/P1/P2), reference
  the ID here. If it ratifies or supersedes an ADR (docs/decisions.md
  D1–D7…), reference that.
  e.g. "Closes P1-7 (refresh-token CSRF)."
       "Implements D1 option 1 (split SUPER_ADMIN)."
-->

## Test plan

<!--
  Bulleted markdown checklist. Include:
  - what you ran locally (typecheck / lint / unit / integration)
  - what CI is expected to cover
  - what the reviewer should run on a real environment (the chaos test
    list in docs/03-stage1-closure.md §3 if relevant)
-->

- [ ] `npm run typecheck` (or `cd apps/api && npx tsc --noEmit -p tsconfig.json`)
- [ ] `npm run lint`
- [ ] `npm test --workspace=apps/api`
- [ ] Manual: <fill in if there's a hot-path / UI surface that warrants it>

## Risk & rollback

<!--
  - What's the blast radius if this merges and is wrong?
  - Is the change reversible by reverting the merge commit, or is there a
    schema migration / data backfill / config change that complicates
    rollback?
  - If it touches a security-sensitive surface (auth, tenant scope, AI
    prompts, JWT, refresh tokens, WS auth), call that out explicitly.
-->

## Out of scope / deferred

<!--
  What's explicitly NOT in this PR. Mirrors the "Out of scope, deferred"
  block at the bottom of recent commit messages — saves the reviewer from
  noticing the absence and asking.
-->
