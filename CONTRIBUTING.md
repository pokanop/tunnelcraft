# Contributing to Tunnelcraft

Thanks for helping improve Tunnelcraft. This repo uses Bun workspaces (`client` + `server`) and CI gates that are easy to miss locally if you only run lint, tests, or the dev server.

## Before you open a PR

Run the same quality gate CI enforces for lint, formatting, and types:

```sh
bun run check
```

`check` runs, in order:

1. `bun run lint` — oxlint
2. `bun run format:check` — oxfmt (read-only; fails if anything is unformatted)
3. `bun run typecheck` — `tsc` for both workspaces

If formatting fails, fix it with:

```sh
bun run format
```

CI also runs `bun test` and `bun run build` on every PR. Run those locally too before requesting review so you catch failures early:

```sh
bun test
bun run build
```

## Optional: pre-push hook

To make `bun run check` hard to skip, install the repo's git hooks once per clone:

```sh
bun run setup:hooks
```

That points `core.hooksPath` at `.githooks/`. The included `pre-push` hook runs `bun run check` before every `git push`. If check fails, fix the reported issues (often `bun run format`) and push again.

To disable hooks for a single push:

```sh
git push --no-verify
```

Use that sparingly — CI will still fail on the same issues.

## Pull requests

- Branch from `main`.
- Keep changes focused; match existing code style (the formatters enforce most of it).
- Confirm `bun run check` (and ideally `bun test` + `bun run build`) in the PR description — the template includes a checklist.

## Development setup

See [README.md](README.md) for install, dev server, and environment variables.
