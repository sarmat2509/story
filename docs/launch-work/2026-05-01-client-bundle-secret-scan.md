# Client Bundle Secret Scan - 2026-05-01

## Scope

Added a launch gate check that fails if server-side secret markers appear in the exported web client bundle.

## Changed

- Added `scripts/scan-client-bundle-secrets.sh`.
- Added root script `pnpm launch:scan-client-secrets`.
- Added the scan after `pnpm --filter wondertales-universal-app build:web` inside `scripts/launch-gate.sh`.
- Updated the P0 production security roadmap notes.

## Coverage

The scan checks text files in `apps/universal-app/dist` for server-only env names and secret prefixes, including database URLs, JWT/session secrets, Stripe secret/webhook keys, Resend/OpenAI/Gemini/Anthropic/ElevenLabs keys, cloud storage secret keys, private-key blocks, and Stripe-style secret prefixes.

## Verification

- `bash -n scripts/scan-client-bundle-secrets.sh`
- `pnpm launch:scan-client-secrets`
