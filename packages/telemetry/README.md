# `@pokanop/telemetry`

This package is a vendored copy of Pokanop's dependency-free TypeScript client for the versioned
telemetry ingestion API. Tunnelcraft uses it only for operational service health: release identifiers,
heartbeat status, and server lifecycle events. Callers must never pass request, user, record, or
health data.

## Tunnelcraft integration

Set the narrowly scoped ingestion token issued for Tunnelcraft:

```sh
export POKANOP_TOKEN="..."
```

The client is a silent no-op when the token is absent. Set `POKANOP_TELEMETRY=off` to disable it even
when a token exists. Tunnelcraft always sends to `https://pokanop.com/api/v1`; the API root is not
environment-configurable in this vendored copy.

Events and usage records are batched. Heartbeats are sent immediately. Transient network failures
and HTTP `408`, `425`, `429`, and `5xx` responses are retried with the same idempotency key. Other
`4xx` responses fail without retrying. Call `flush()` at durable lifecycle boundaries and `close()`
during graceful shutdown.

The raw HTTP contract is:

| Method | Endpoint             | Scope required      | SDK method    |
| ------ | -------------------- | ------------------- | ------------- |
| POST   | `/api/v1/heartbeats` | `ingest:heartbeats` | `heartbeat()` |
| POST   | `/api/v1/events`     | `ingest:events`     | `event()`     |
| POST   | `/api/v1/usage`      | `ingest:usage`      | `usage()`     |

Requests use `Authorization: Bearer <token>`, JSON bodies, and a unique `Idempotency-Key` per batch.
The API returns HTTP `202` with `{ "accepted": number, "duplicates": number }`.

## Operational data only

`OperationalData` accepts JSON-compatible values intended for service state such as release
versions, durations, queue depths, provider status, and aggregate counts. Do not send end-user
identifiers, contact information, credentials, payment data, message contents, arbitrary request
bodies, DICOM metadata, or protected health information.

The client recursively rejects obvious PII keys as a secondary guardrail. That denylist cannot make
arbitrary payloads safe; the Tunnelcraft integration therefore constructs its closed payload shapes in
`apps/server/src/telemetry.ts`, where request and health-record data are unavailable.

## Provenance and resync

- Upstream: [`pokanop/web`](https://github.com/pokanop/web/tree/ee73b9aadbb84313683d2ea80164c20c26bab711/packages/telemetry)
- Source commit: `ee73b9aadbb84313683d2ea80164c20c26bab711`
- Upstream package version: `0.1.0`
- Vendored paths: `src/client.ts`, `src/errors.ts`, `src/index.ts`, and `src/types.ts`

The intentional divergence from upstream is the removal of `POKANOP_API_URL` environment handling.
Tunnelcraft passes the production Pokanop API root explicitly, preventing an environment variable from
redirecting operational telemetry.

To resync:

1. Check out `pokanop/web` at the desired reviewed commit and compare its `packages/telemetry/src`
   files and `packages/telemetry/test/client.test.ts` with this package.
2. Copy upstream source changes and port every upstream client test into `src/client.test.ts`.
3. Remove `POKANOP_API_URL` environment handling while retaining the explicit `apiUrl` option used by
   Tunnelcraft.
4. Update the source commit and package version above, format the files, and run
   `bun run test packages/telemetry/src/client.test.ts` plus the repository quality gates.

## License

MIT
