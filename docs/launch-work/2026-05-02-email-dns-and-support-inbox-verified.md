# Email DNS and Support Inbox Verification

Date: 2026-05-02

## Summary

- Verified Resend sender domain setup for `wondertales.art` after DNS changes.
- Verified Zoho Mail inbound MX setup for `support@wondertales.art`.
- Updated `scripts/check-production-auth.sh` so it accepts Resend's DKIM TXT record at `resend._domainkey.wondertales.art`, not only older/common DKIM CNAME candidates.
- Confirmed `support@wondertales.art` receives external mail in Zoho and can send replies using the support sender.

## Validation

- Public DNS checks:
  - `wondertales.art` MX points to `mx.zoho.eu`, `mx2.zoho.eu`, and `mx3.zoho.eu`;
  - `wondertales.art` TXT includes `v=spf1 include:zohomail.eu ~all`;
  - `_dmarc.wondertales.art` TXT is `v=DMARC1; p=none;`;
  - `send.wondertales.art` MX points to `feedback-smtp.eu-west-1.amazonses.com`;
  - `send.wondertales.art` TXT is `v=spf1 include:amazonses.com ~all`;
  - `resend._domainkey.wondertales.art` TXT returns the Resend DKIM public key.
- TCP smoke confirmed Zoho MX hosts accept SMTP connections on port `25`.
- `./scripts/check-production-auth.sh` passed with `0` failures and `0` warnings; before the script fix it reported only one false warning for DKIM CNAME detection while the Resend DKIM TXT record was present.
- Production API logs in the auth smoke window no longer showed Resend domain verification failures.
- Set `SUPPORT_EMAIL=support@wondertales.art` in the production environment and recreated the API container so support email configuration is explicit instead of relying only on the code fallback.

## Migration Notes

- No database migration was needed.
- No destructive schema operation was performed.

## Follow-Up

- Send one real password-reset email to an account-controlled inbox to confirm end-to-end Resend delivery from the application.
- Optionally harden DMARC from `p=none` to quarantine/reject after a few days of clean mail flow.
