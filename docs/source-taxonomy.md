# Source taxonomy

The taxonomy keeps Knock! Knock! useful without turning it into an unrestricted surveillance crawler. Live providers return candidate URLs; the classifier assigns each result to a category, subcategory, sensitivity level, and risk tags.

## Categories

- `social`: Instagram, Facebook, X/Twitter, TikTok, LinkedIn, YouTube, Reddit, visual networks, federated/new networks, legacy/niche networks.
- `commerce`: global marketplaces, TR marketplaces, small e-commerce and classified sites.
- `entertainment`: video/streaming, music/podcast, film/events, news/publishing.
- `community`: forums, chat/group pages, blogs and personal sites.
- `professional`: developer/code sites, academic profiles, company/team pages.
- `data-broker`: people-search sites, phonebooks, lookup directories.
- `exposure`: paste/dump/leak pages, doxxing/threat indicators.
- `adult-sensitive`: adult, creator/subscription, live adult, adult dating/community sources.
- `other-sites`: uncatalogued open-web results.

## Scan depth

- `balanced`: exact global queries only.
- `wide`: exact global queries plus scoped searches across common social, commerce, entertainment, community, professional, broker, and exposure domains.
- `maximum`: wider scoped search catalog. Adult/sensitive domains are included only when the user explicitly enables sensitive sources.

## Hard boundaries

- The system does not bypass login walls, paywalls, blocks, robots policies, rate limits, or platform terms.
- The system classifies open-source results returned by contracted search providers and source APIs.
- Adult/sensitive sources are classification targets only when explicitly enabled. Their snippets are redacted in the response.
- The taxonomy is designed to be updated regularly; it cannot guarantee every historical or obscure social network is covered.
