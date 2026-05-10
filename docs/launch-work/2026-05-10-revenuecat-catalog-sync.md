# RevenueCat Catalog Sync

## What Changed

- Added a repeatable RevenueCat catalog sync script:
  - `pnpm launch:sync-revenuecat-catalog -- --env-file=.env.production`
  - dry-run by default
  - `--apply` creates missing products, entitlement, offering, packages, and attachments
- Added a read-only RevenueCat readiness check:
  - `pnpm launch:check-revenuecat-catalog -- --env-file=.env.production`
- Added helper tests:
  - `pnpm test:revenuecat-catalog`

## Expected Environment

Required for API access:

```env
REVENUECAT_API_V2_SECRET_KEY=sk_...
REVENUECAT_PROJECT_ID=proj_...
```

The RevenueCat V2 secret key needs these permissions:

```text
project_configuration:apps:read
project_configuration:products:read_write
project_configuration:entitlements:read_write
project_configuration:offerings:read_write
project_configuration:packages:read_write
```

Required for app/runtime config:

```env
EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=appl_...
EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY=goog_...
EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID=premium
EXPO_PUBLIC_REVENUECAT_OFFERING_ID=default
REVENUECAT_WEBHOOK_AUTHORIZATION=Bearer ...
REVENUECAT_PRODUCT_PLAN_MAP=...
```

Optional if app auto-discovery is ambiguous:

```env
REVENUECAT_IOS_APP_ID=app_...
REVENUECAT_ANDROID_APP_ID=app_...
REVENUECAT_APP_IDS=app_ios,app_android
```

## Generated Catalog Shape

- Entitlement lookup key: `premium` by default.
- Offering lookup key: `default` by default.
- Packages:
  - `silver_monthly`
  - `golden_monthly`
  - `fairyworld_monthly`
- Store identifiers:
  - iOS: `com.wondertales.<plan>.monthly`
  - Google Play: `com.wondertales.<plan>:monthly`
  - Test Store: `wondertales_<plan>_monthly`

The generated `REVENUECAT_PRODUCT_PLAN_MAP` maps every RevenueCat webhook
`product_id` back to the WonderTales plan slug.

## Safe Run Order

1. Run the local helper tests:

```bash
pnpm test:revenuecat-catalog
```

2. Run a RevenueCat dry-run:

```bash
pnpm launch:sync-revenuecat-catalog -- --env-file=.env.production
```

3. Copy the printed `REVENUECAT_PRODUCT_PLAN_MAP` into `.env.production`.

4. Apply the catalog changes only after the dry-run looks right:

```bash
pnpm launch:sync-revenuecat-catalog -- --env-file=.env.production --apply
```

5. Re-run the read-only check:

```bash
pnpm launch:check-revenuecat-catalog -- --env-file=.env.production
```

## Notes

- The secret API key is for ops/server scripts only. It must never be shipped in
  the app bundle.
- The app uses public SDK API keys only.
- If RevenueCat has a single entitlement such as `premium`, keep backend plan
  resolution based on `REVENUECAT_PRODUCT_PLAN_MAP`; one entitlement cannot
  distinguish between Silver, Golden, and Fairy World quotas.
