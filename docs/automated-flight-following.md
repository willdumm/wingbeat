# Automated Flight Following (AFF): research notes

Research from 2026-10-09 on what it would take for Wingbeat to be accepted by the
interagency (USFS / DOI) Automated Flight Following system, and which tracker hardware
and providers already are. The user-facing summary is
`site/content/docs/features/automated-flight-following.md`.

**Conclusion:** Wingbeat does not support AFF and isn't trying to become an AFF provider.
An operator who needs AFF should carry an AFF-approved tracker on an approved provider's
platform, so AFF compliance is entirely that provider's responsibility. Wingbeat can sit alongside
it once it can read that provider's feed. The best candidate is a RockAIR on TracPlus.

## What AFF is

[aff.gov](https://www.aff.gov/) is the government application dispatchers use to watch
contract aircraft (fire, DOI). It doesn't receive positions from aircraft directly. It
polls each approved vendor's servers (the spec calls them the vendor "NOC") over HTTPS.
Operators register each tracking device and aircraft on aff.gov. Helpdesk:
affadmin@firenet.gov, (866) 224-7677, weekdays 07:30–17:00 Mountain. The spec's subtitle is
"Certification and Accreditation Criteria", but no public onboarding guide for new
vendors exists. The way in is to email the helpdesk.

Not to be confused with FAA Part 135 flight locating (14 CFR 135.79 / OpSpec A008). That is
the operator's own procedure, approved by their inspector. There's no software
certification there, and Wingbeat can only be a tool inside an operator's existing
procedures.

## The vendor spec

Two versions: the [XML spec](https://www.aff.gov/support/Specification_Section_Supplement.pdf)
(10/14/15) and the newer [JSON spec](https://www.aff.gov/support/Json_Specification_Section_Supplement.pdf)
(9/16). Numbers below are from the JSON spec.

| Requirement | Value |
|---|---|
| Report interval | At least one position every 2 minutes |
| Latency | Position available at AFF less than 2 min after the GPS fix time |
| Quality | Only valid 3D fixes count. Fix type `3D`/`2D`/`invalid`. `pdop` is **required** (`hdop` is allowed instead for equipment bought before 2016) |
| Units | Decimal degrees WGS84, altitude m (MSL or ellipsoid), speed m/s, course in degrees true, ±100 m accuracy |
| Device ID (`esn`) | Embedded by the device, no lookup tables. IMEI is fine |
| Heartbeat | A dedicated unit on the same hardware and satellite path, sending a report every 5–10 min (`unitId: "Heartbeat"`) |
| Uptime | 99.9% on a 7-day rolling average, measured by the heartbeat (at most one 20-min outage in 7 days) |
| Missing or invalid reports | ≤0.2% in any 5-min block, ≤0.1% in any 10-min block (7-day average) |
| Storage | ≥14 days at the vendor |
| Delivery | AFF POSTs a `dataRequest` with `dataCtrTime` and HTTP basic auth, as often as every 15 s, from 3–6 servers that aren't synchronized. The vendor returns a GeoJSON `FeatureCollection` with `dataInfo` plus every position inserted since that time. 60 s of data must come back within 30 s |
| Security | TLS, and a signed Interconnection Security Plan with the government (Exhibit 1, not public) |
| Ops | Changes and outages reported to affadmin@firenet.gov |
| `provider` | "Hardware and Data vendor (Must be one stop shopping)" |

Notes on interpretation:

- "One stop shopping" can't mean owning the whole chain. Every approved vendor
  sends data through Iridium's (or Globalstar's) gateway. It most likely means a single
  vendor accountable for both hardware and data. Ask the helpdesk before relying on that.
- Iridium doesn't threaten the 2-minute latency limit. Short-burst messages take about
  6 s on average to reach the ground, with a tail to about 25 s
  ([arXiv 2407.19623](https://arxiv.org/pdf/2407.19623)). Latency problems come from
  polling intermediaries.
- The [A-115 AFF training workbook](https://gacc.nifc.gov/nrcc/dispatch/nrdsc/2014workshop/A115_AFF_2013.pdf)
  (2013) describes AFF as an installed "kit" (modem, GPS, controller, antennas). Portable
  units are approved in practice (RockAIR), but contract language may still say "installed".

## Could Wingbeat + inReach meet it?

Not as Wingbeat ingests data today:

- **MapShare polling is too slow.** We poll the KML feed about every 2 min, on top of the
  device's own interval, so positions can be about 4 min old. Garmin's push API,
  [IPC Outbound](https://developer.garmin.com/inReach/IPC_Outbound.pdf) (Professional and
  Enterprise accounts only), fixes that. It POSTs each event as soon as Iridium's gateway
  delivers it, retrying after 2, 4, … 128 s on failure, then pausing for 12 hours at a
  time after 12 hours of continuous failure.
- **Fix type:** IPC Outbound has `gpsFix` (0 none, 1 2D, 2 3D, 3 3D+). The MapShare KML
  only has a "Valid GPS Fix" boolean.
- **No PDOP anywhere in Garmin's data.** This is the hard blocker, since `pdop` is
  required, and it's the first question to ask the AFF helpdesk.
- IPC gives speed in km/h (convert to m/s), altitude in m, course in degrees true, and the
  IMEI. All usable.
- Wingbeat would also need the pull endpoint, a heartbeat unit, a per-point ingest
  timestamp (to answer `dataCtrTime` queries), the uptime record and the security
  agreement.

## AFF-approved hardware and platforms

- **v2track** (NZ): its platform is AFF-approved for the v2track V5, Ground Control
  RockAIR, Flightcell DZMx, AMS AFDAU-T1 and Trotter DataVault
  ([source](https://v2track.com/trotter-datavault-added-to-devices-approved-on-v2track-for-usfs/)).
  The only published API, v2Connect, is a Bluetooth/RS232 link to the device. There's no
  documented third-party cloud feed.
- **TracPlus**: an approved AFF tracking provider in the USA, providing AFF across
  CAL FIRE's whole fleet since 2017
  ([source](https://tracplus.com/tracplus-blog/usfs-aff-aerial-fire-updates-for-usa-operators)).
  RockAIR's USFS approval was granted through TracPlus USA
  ([source](https://aerialfiremag.com/2016/12/16/rockair-approved-for-usfs-airborne-firefighting-dunedin-new-zealand)).
  It offers outbound feeds in CSV, TAB, GeoRSS, KML, USFS AFF and USFS JSON formats, plus
  custom ones ([source](https://www.tracplus.com/knowledge/viewing-tracking-data-from-3rd-party-devices-in-tracplus)).
- **Spidertracks**: Spidertracks and Olympic Aero Services hold an FAA STC for their
  additional telemetry unit plus AFF feed, for USFS firefighting helicopters.

The approval is for a device-plus-platform pairing. RockAIR sending straight to
Wingbeat would make Wingbeat the vendor platform and bring back every platform-side
requirement above.

## RockAIR sourcing

[RockAIR](https://www.groundcontrol.com/product/rockair-satellite-aircraft-helicopter-tracking-device/)
(Ground Control): portable, Iridium plus cellular with automatic switching, reports
every 15 s to 24 h, can POST to the customer's own web service, logs at 1 Hz to SD.

| Source | Notes |
|---|---|
| **TracPlus USA** (recommended) | AFF approval runs through them. Third-party feeds Wingbeat could ingest. RockAIR from $1,795, with unlimited 15-second cellular tracking on all airtime plans ([undated press release](https://verticalmag.com/press-releases/tracplus-announces-globally-connected-cockpit-rockair/)). Airtime prices unpublished. sales@tracplus.com |
| Ground Control direct | Transparent [SBD tariffs](https://groundcontrol.com/products/iridium/short-burst-data-range/short-burst-data-sbd-tracking-tariffs/): $12/month (every 6 h) to $122/month (every 5 min), $30 activation, no termination fee. Nothing faster than 5 min is published, so too slow for AFF. Fine for a cheap development unit. US office: Las Vegas, +1.805.783.4600, hello@groundcontrol.com |
| v2track | Approved, but no published prices and no third-party feed found |
| Dallas Avionics | US hardware reseller only. Airtime still comes from a provider |

Questions to put to TracPlus:

1. Monthly cost per aircraft for 2-minute Iridium tracking, for a mostly satellite fleet
   (cell coverage in remote Alaska is thin).
2. Whether AFF forwarding is included.
3. The third-party feed for Wingbeat: format, push or pull, cost, and how much delay it
   adds.
4. Whether the hardware can be rented or bundled into the monthly plan.
5. Whether the RockAIR LTE model has US/Alaska (AT&T, GCI) coverage.

## inReach plan intervals (for the docs)

Garmin's personal plans (restructured late 2024): Enabled and Essential bill per tracking
point at 10-minute-or-longer intervals, Standard has unlimited tracking at 10 minutes or
longer, and only **Premium** allows 2-minute intervals. Professional plans offer 10- or
2-minute tracking, with custom options on request
([Treeline Review](https://www.treelinereview.com/news/explaining-new-garmin-inreach-subscription-plans)).
Wingbeat's flight segmentation and signal-gap alerts assume about 2-minute points, so
the docs tell users they need Premium or a Professional plan with 2-minute tracking.

## Next steps if this is picked up

1. Email affadmin@firenet.gov about PDOP, portable devices, and whether a relay-only
   provider counts as "one stop". This only matters if Wingbeat ever wants to be the
   AFF vendor itself.
2. Ask TracPlus for a quote and feed details (questions above).
3. Add a push-ingest tracker type (IPC Outbound for inReach, or the TracPlus or RockAIR
   feed) next to MapShare polling in `src/poller.ts`.
