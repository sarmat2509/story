# Legal Content Draft

Date: 2026-05-01

## What changed

- Replaced placeholder English and Ukrainian Terms of Service pages.
- Replaced placeholder English and Ukrainian Privacy Policy pages.
- Covered adult-owned accounts, child consent, child data, AI-generated content, public/unlisted/private sharing, subscriptions, cancellation, refund requests, retention, deletion, cookies, analytics, processors, data rights, and support contact.
- Kept the document version aligned with consent records: `2026-05-01`.
- Left an explicit operator identity confirmation note in the public legal text instead of guessing a legal entity.

## Sources checked

- FTC COPPA overview: https://www.ftc.gov/legal-library/browse/rules/childrens-online-privacy-protection-rule-coppa
- European Commission child data safeguards under GDPR: https://commission.europa.eu/law/law-topic/data-protection/rules-business-and-organisations/legal-grounds-processing-data/are-there-any-specific-safeguards-data-about-children_en
- European Commission GDPR individual rights: https://commission.europa.eu/law/law-topic/data-protection/information-individuals_en
- EDPB erasure request guidance: https://www.edpb.europa.eu/sme-data-protection-guide/faq-frequently-asked-questions/answer/how-do-i-respond-request-erasure_en

## Verification

- `pnpm --filter wondertales-api build`
- `curl -H 'Accept-Language: en' http://localhost:8081/privacy` shows the updated English privacy content.
- `curl -H 'Accept-Language: uk' http://localhost:8081/terms` shows the updated Ukrainian terms content.
- In-app browser smoke opened `/privacy`, found the Privacy heading and support footer link, with zero console errors.

## Remaining launch blocker

The final legal operator name, registered address, merchant-of-record arrangement, and jurisdiction-specific refund/cancellation wording still need owner/legal confirmation before external paid use. I intentionally did not invent those values from the repository or local machine context.
