# Localized SEO production smoke

Date: 2026-05-02

## What changed

- Extended `scripts/check-production-smoke.sh` to crawl launch SEO locale routes and verify `html[lang]`, canonical URL, `uk`/`en` hreflang alternates, and `x-default`.
- The smoke asserts incomplete locales (`ru`, `es`, `de`, `fr`, `pl`) do not appear as public hreflang alternates.

## Production verification

- `bash -n scripts/check-production-smoke.sh`
- `CHECK_PROD_REMOTE=0 ./scripts/check-production-smoke.sh`
- DevTools opened `https://wondertales.art/en/pricing` and confirmed English pricing content, English footer links, and the `uk`/`en` language selector render live.

Verified routes:

- `/`
- `/en`
- `/pricing`
- `/en/pricing`
- `/stories`
- `/en/stories`
- `/terms`
- `/en/terms`
- `/privacy`
- `/en/privacy`

## Notes

- No migration was needed.
- No production deploy was needed because this batch changes the local smoke script and documentation only.
