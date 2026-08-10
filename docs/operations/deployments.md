# Production deployment runbook

Production runs the pre-built `ghcr.io/pokanop/tunnelcraft:latest` image on the
Dokploy Raspberry Pi. Builds do not run on the production node.

## Root cause of the July 20 deployment freeze

The original workflow stopped after publishing `latest` and an immutable commit
SHA tag to GHCR. It did not call Dokploy, and no Watchtower or other image updater
was configured on production. Publishing a container image does not notify or
restart an existing container, so Dokploy kept serving the image it pulled on
July 20 even though later `main` builds were present in GHCR.

## One-time Dokploy setup

Configure the TunnelCraft application in Dokploy to pull
`ghcr.io/pokanop/tunnelcraft:latest`. Keep the existing persistent volume mounted
at `/app/server/data` and the existing production environment variables. Dokploy
must have a GHCR credential that can read the private package.

Create the `production` GitHub Environment and store these as environment-level
GitHub Actions secrets:

- `DOKPLOY_URL`: the Dokploy base URL, with no API path
- `DOKPLOY_API_KEY`: an API key scoped to deploy the TunnelCraft application
- `DOKPLOY_APPLICATION_ID`: TunnelCraft's Dokploy application ID

Leave the `DOKPLOY_DEPLOY_ENABLED` repository variable unset (or set to `false`)
until all three secrets and the Dokploy image configuration are confirmed. Set
it to `true` to activate automatic production rollout. The deploy step fails
with the names of missing secrets if rollout is enabled prematurely.

The publish job runs on a fresh GitHub-hosted runner, not on the persistent
self-hosted runners that execute pull-request code. The `production` environment
further prevents other jobs from reading its deploy secrets. Keep
`DOKPLOY_URL` and `DOKPLOY_APPLICATION_ID` secret even though they are not
credentials: masking the private Dokploy control-plane hostname and application
identifier is intentional for this public repository.

The Dokploy request contract is:

```text
POST /api/application.deploy
x-api-key: <DOKPLOY_API_KEY>
content-type: application/json

{"applicationId":"<id>","title":"GHCR <short-sha>","description":"Published <image-and-digest> from <full-sha>"}
```

This exact schema and endpoint were accepted by the Pokanop Dokploy instance in
the successful `pokanop/web` production deployment on July 21, 2026
([workflow run](https://github.com/pokanop/web/actions/runs/29862216702)). The
application ID must refer to a Docker-image application configured to pull GHCR;
the post-deploy public commit check is authoritative if Dokploy is accidentally
configured to rebuild source instead.

## Automated release path

A push to `main` runs `.github/workflows/ci.yml` in this order:

1. Run the application checks, container build, and capstone tests.
2. Publish the immutable full commit SHA tag for both `linux/amd64` and
   `linux/arm64`, with the commit stamped into the image.
3. Inspect the published OCI index and require manifests for both platforms.
4. Promote that verified digest to `latest` without rebuilding it.
5. Call Dokploy's authenticated `POST /api/application.deploy` endpoint. Dokploy
   pulls `ghcr.io/pokanop/tunnelcraft:latest` and replaces the application
   container while retaining `/app/server/data`.
6. Poll the public readiness endpoint for up to 10 minutes and require its
   `commit` field to equal the merged Git SHA. A request accepted by Dokploy but
   not serving on `tunnelcraft.org` fails the workflow.

The workflow prints the OCI index digest and both platform-manifest digests.
Preserve these in the GitHub Actions run as the release record.

## Release verification

In Dokploy, confirm that the deployment log shows an authenticated GHCR pull and
does not show a repository clone or an on-device Docker build. Then confirm:

- the running image is `ghcr.io/pokanop/tunnelcraft:latest` and its resolved
  `linux/arm64` digest matches the workflow output;
- startup logs report the server listening on port 4000 with no migration error;
- the container restart count remains zero;
- `https://tunnelcraft.org/api/health/ready` returns HTTP 200 and its `commit`
  field equals the merged full Git SHA; and
- `https://tunnelcraft.org/reset-password` loads the dedicated reset-password
  page after POK-334 / PR #18 is merged.

For the POK-334 release, complete the last check in a browser so client-side
routing is exercised, then ask QA to test a real reset email on production.

## Manual rollout

Use this only while bootstrapping the automated path or during a GitHub Actions
outage:

1. Confirm the `main` publish job succeeded and record its OCI index and
   `linux/arm64` digests.
2. In Dokploy, confirm TunnelCraft uses `ghcr.io/pokanop/tunnelcraft:latest`, then
   click **Deploy**. Do not rebuild source on the Raspberry Pi.
3. Run every release-verification check above and record the result.

## Rollback

Every release also publishes the immutable tag
`ghcr.io/pokanop/tunnelcraft:<full-commit-sha>`.

1. Set the `DOKPLOY_DEPLOY_ENABLED` repository variable to `false` so automated
   releases do not keep redeploying the pinned image.
2. In Dokploy, replace `latest` with the previous known-good full commit SHA tag.
3. Deploy without changing the `/app/server/data` volume or environment.
4. Verify readiness, the home page, application logs, resolved image digest, and
   restart count.
5. After remediation, restore the image tag to `latest`, deploy once, confirm the
   fixed commit through the readiness endpoint, then set
   `DOKPLOY_DEPLOY_ENABLED` back to `true`.

Database migrations are forward-only. If a failed release includes a migration,
review it before rollback and restore the pre-deployment SQLite backup when the
older application cannot safely read the migrated schema.
