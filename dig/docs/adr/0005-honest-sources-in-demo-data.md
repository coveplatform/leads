# ADR-0005: Demo sources are provider *search* links

**Status:** accepted

We cannot verify specific YouTube uploads from the build environment, and the
blueprint forbids inventing working links. Demo records therefore carry a `demo`
provider source whose URL is a YouTube *search* for artist + title, labelled
"Sample record: opens a provider search, not a verified upload", with
`rights_status = demo_placeholder` and `playability = external_only`. One record
also carries an `unavailable` source to exercise that UI state. Real pasted links
use real provider adapters and official embeds.
