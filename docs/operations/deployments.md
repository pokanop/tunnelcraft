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

Create these repository-level GitHub Actions secrets:

- `DOKPLOY_URL`: the Dokploy base URL, with no API path
- `DOKPLOY_API_KEY`: an API key scoped to deploy the TunnelCraft application
- `DOKPLOY_APPLICATION_ID`: TunnelCraft's Dokploy application ID

Leave the `DOKPLOY_DEPLOY_ENABLED` repository variable unset (or set to `false`)
until all three secrets and the Dokploy image configuration are confirmed. Set
it to `true` to activate automatic production rollout. The deploy step fails
with the names of missing secrets if rollout is enabled prematurely.

## Automated release path

A push to `main` runs `.github/workflows/ci.yml` in this order:

1. Run the application checks, container build, and capstone tests.
2. Publish `latest` and the immutable full commit SHA tag for both `linux/amd64`
   and `linux/arm64`.
3. Inspect the published OCI index and require manifests for both platforms.
4. Call Dokploy's authenticated `POST /api/application.deploy` endpoint. Dokploy
   pulls `ghcr.io/pokanop/tunnelcraft:latest` and replaces the application
   container while retaining `/app/server/data`.

The workflow prints the OCI index digest and both platform-manifest digests.
Preserve these in the GitHub Actions run as the release record.

## Release verification

In Dokploy, confirm that the deployment log shows an authenticated GHCR pull and
does not show a repository clone or an on-device Docker build. Then confirm:

- the running image is `ghcr.io/pokanop/tunnelcraft:latest` and its resolved
  `linux/arm64` digest matches the workflow output;
- startup logs report the server listening on port 4000 with no migration error;
- the container restart count remains zero;
- `https://tunnelcraft.org/api/health/ready` returns HTTP 200; and
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

1. In Dokploy, replace `latest` with the previous known-good full commit SHA tag.
2. Deploy without changing the `/app/server/data` volume or environment.
3. Verify readiness, the home page, application logs, resolved image digest, and
   restart count.
4. After the incident is resolved, restore the image tag to `latest`; otherwise
   future automated deploys will restart the pinned rollback image.

Database migrations are forward-only. If a failed release includes a migration,
review it before rollback and restore the pre-deployment SQLite backup when the
older application cannot safely read the migrated schema.
