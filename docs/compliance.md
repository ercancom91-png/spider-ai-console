# Compliance posture

Knock! Knock! is a consent-gated public presence audit prototype. It is not a people-search, stalking, doxxing, skip-tracing, surveillance, or unrestricted scraping product.

## Product boundaries

- The user must declare that the audit is for their own data, legal representation, or documented authority.
- The product only returns source links, provider title/snippet text, match evidence, and timestamps.
- It does not store raw page copies by default.
- It does not infer sensitive attributes, family relationships, location history, political views, religion, health, sexuality, or behavior patterns.
- The photo input is hashed in the browser. The image is not uploaded to the server in this prototype.
- Real web coverage must use contracted search APIs or source-specific APIs. Do not bypass access controls, robots policies, rate limits, paywalls, or platform terms.
- Remediation guidance is informational. It points users to source-site removal, platform account controls, search engine removal/reporting flows, and a user-editable request template.
- Sensitive source categories require explicit user opt-in and have snippets redacted. The product classifies open-source results returned by search providers.

## Legal checklist before production

- Identify the controller/processor roles and document the lawful basis for each processing purpose.
- Publish a clear privacy notice before data entry.
- Add identity verification for data subject access, deletion, export, and objection requests.
- Keep retention short and configurable per purpose.
- Keep audit logs for consent, provider calls, and deletion events without exposing raw identifiers to operators.
- Add provider terms review for each API.
- Run a data protection impact assessment before enabling face matching, large-scale scraping, or third-party investigations.
- Review and refresh platform removal URLs regularly because account deletion and search removal flows change over time.
- Review the source taxonomy regularly because social networks, marketplaces, and sensitive platforms change frequently.

## Useful official references

- European Commission, GDPR information for individuals: https://commission.europa.eu/law/law-topic/data-protection/information-individuals_en
- GDPR text, Regulation (EU) 2016/679: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679
- EU AI Act text, Regulation (EU) 2024/1689: https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689
- Google Search, gizli bilgileri kaldırma: https://support.google.com/websearch/answer/9673730?hl=tr
- Google Search Console, eski içerik kaldırma: https://search.google.com/search-console/remove-outdated-content
- Microsoft Support, Bing concern/reporting: https://support.microsoft.com/en-us/topic/how-to-report-a-concern-or-contact-bing-1831f0fe-3c4d-46ae-8e57-16c487715729
- GitHub Docs, deleting your personal account: https://docs.github.com/en/account-and-profile/how-tos/account-management/deleting-your-personal-account
- X Help, deactivate/delete account: https://help.x.com/en/managing-your-account/how-to-deactivate-x-account
- TikTok Support, deleting an account: https://support.tiktok.com/en/account-and-privacy/deleting-an-account/
- KVKK official site: https://www.kvkk.gov.tr/
- KVKK, açık rıza alırken dikkat edilecek hususlar: https://www.kvkk.gov.tr/Icerik/2037/Acik-Riza-Alirken-Dikkat-Edilecek-Hususlar
- KVKK, kişisel verilerin işlenme şartları: https://www.kvkk.gov.tr/Icerik/4190/Kisisel-Verilerin-Islenme-Sartlari
