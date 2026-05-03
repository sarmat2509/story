# Billing state invalidation helper

Date: 2026-05-03

## What changed

- Added `invalidateBillingState(queryClient)` in the app billing API module.
- Reused the helper after subscription checkout creation, bundle checkout creation, customer portal session creation, test-mode plan upgrades, and the billing success screen.

## Why

The roadmap requires bundle prices, current plan, and usage to refresh after checkout, portal return, plan changes, and billing success. These flows were already invalidating the right query families, but each flow listed them separately. A shared helper keeps future billing mutations from refreshing only part of the billing state.

## Verification

- Covered by app type-check and existing billing flow tests.

## Notes

- This is behavior-preserving. It centralizes the existing query invalidation set: `plans`, `plans/with-auth`, `bundles`, and `subscription-usage`.
