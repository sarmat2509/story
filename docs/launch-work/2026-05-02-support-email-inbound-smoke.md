# Support Email Inbound Smoke

Date: 2026-05-02

## Summary

- Expanded `scripts/check-production-auth.sh` to check the configured support inbox domain.
- The check now verifies that the support email domain has MX records, that the primary MX resolves, and that SMTP port `25` accepts a TCP connection from the smoke runner.
- The check is warning-level because mailbox delivery still requires a real inbox confirmation, but it makes broken inbound support routing visible in repeatable launch checks.

## Validation

- `bash -n scripts/check-production-auth.sh`
- `CHECK_PROD_REMOTE=0 ./scripts/check-production-auth.sh`
- `./scripts/check-production-auth.sh`
- Current DNS observation:
  - `support@wondertales.art` uses MX `mail.wondertales.art`;
  - `mail.wondertales.art` resolves to `167.172.102.75`;
  - SMTP port `25` timed out from the smoke runner, so inbound support mail is not verified yet.
- Full production auth/support smoke passed with `0` failures and `4` warnings: missing SPF, missing DMARC, missing common Resend DKIM CNAMEs, and support MX SMTP timeout.
- Remote Docker logs still show the known Resend domain verification blocker for outgoing welcome email.

## Migration Notes

- No database migration was needed.
- No destructive schema operation was performed.

## Follow-Up

- Configure a real mailbox or forwarding provider for `support@wondertales.art`.
- Re-run the auth/support smoke from an external network and confirm SMTP reachability plus real inbox delivery.
