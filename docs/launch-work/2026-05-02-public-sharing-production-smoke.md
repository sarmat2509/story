# Public sharing production smoke coverage

Date: 2026-05-02

## What changed

- Extended `scripts/check-production-smoke.sh` with production checks for public sharing safety contracts.
- The smoke now verifies that public story list/detail and public author APIs omit sensitive fields.
- The smoke verifies legacy public story endpoints return successor deprecation headers.
- The smoke verifies invalid unlisted story, unlisted API, and unlisted share-card routes return `404`.
- The smoke verifies `sitemap.xml` includes public story surfaces and excludes `/u/` unlisted share links.

## Production verification

- `bash -n scripts/check-production-smoke.sh`
- `CHECK_PROD_REMOTE=0 ./scripts/check-production-smoke.sh`
- `./scripts/check-production-smoke.sh` with remote docker log tail
- DevTools production smoke opened `/stories/taiemnitsya-mors-kogo-spivu`, confirmed the public story renders, and opened the report modal with `Публічна історія` context and support topics.

The production smoke passed the public checks with `0` failures. The only warnings were expected authenticated/admin skips when smoke credentials were not exported into the shell. Remote API log tail after the run showed only normal Google OAuth startup configuration.

## Notes

- No migration was needed.
- No production deploy was needed because this batch changes the local smoke script and documentation only.
