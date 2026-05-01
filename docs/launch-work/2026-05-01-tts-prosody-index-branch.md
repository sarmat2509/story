# TTS Prosody Index Branch

Date: 2026-05-01

## Roadmap Area

- Launch audio/read-along reliability.

## Changes

- Added an alternate deferred TTS prosody LLM mode that returns bracket tag insertions by UTF-16 index instead of rewriting the full tagged transcript.
- Added projection/repair helpers so approved bracket tags can be projected back onto canonical narration when the LLM response drifts lexically.
- Added branch diagnostics to the story deferred prosody script for comparing full-text and index-json outputs.
- Added focused tests for index insertion and tag projection helpers.

## Verification

- `pnpm --filter wondertales-api exec tsx src/utils/__tests__/ttsProsodyIndexInsertions.test.ts`
- `pnpm --filter wondertales-api exec tsx src/utils/__tests__/ttsProsodyTagProjection.test.ts`
- `pnpm --filter wondertales-api build`

## Notes

- Generated `.txt` diagnostics from local TTS experiments were left uncommitted; they are useful for local inspection but not required for runtime or tests.
