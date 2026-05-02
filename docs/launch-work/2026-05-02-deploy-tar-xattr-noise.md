# Deploy Tar Xattr Noise

Date: 2026-05-02

## Context

Production web deploys were successful, but the tar extraction output on the droplet was noisy with macOS extended-attribute warnings:

```text
tar: Ignoring unknown extended header keyword 'LIBARCHIVE.xattr.com.apple.provenance'
```

That warning does not indicate a broken deploy, but it makes the deploy output harder to scan for real production errors.

## Changes

- Added a shared `create_deploy_tarball` helper to `scripts/deploy.sh`.
- Added the same helper to the legacy `scripts/deploy-webapp.sh`.
- Both nginx config archives and web `dist/` archives now use `COPYFILE_DISABLE=1 tar --no-xattrs`.

## Verification

- `bash -n scripts/deploy.sh scripts/deploy-webapp.sh`
- Local tar smoke with `COPYFILE_DISABLE=1 tar --no-xattrs -czf ...`.
- `./scripts/deploy.sh --web`
- `curl -fsS https://wondertales.art/health`
- `pnpm launch:check-production-security-artifacts`
- Production Docker log scan for the last 5 minutes across `api`, `webapp`, and `nginx` found no `error`, `warn`, `failed`, `panic`, `unhandled`, `exception`, `temporary file`, `LIBARCHIVE`, or `xattr` matches.

## Result

The production web deploy path completed without the previous `LIBARCHIVE.xattr` tar warnings, and the post-deploy health/security/log checks stayed green.
