---
title: Trackers and AFF
description: "Wingbeat needs your own GPS tracker and a tracking plan with a short enough interval. It is not an Automated Flight Following (AFF) provider, but can run alongside one."
weight: 9
---

# Trackers and Automated Flight Following

## You need your own tracker

> [!WARNING]
> **Wingbeat doesn't supply tracking hardware or satellite service.** It reads the
> positions your own trackers already report. Every aircraft or pilot you want to see in
> Wingbeat needs a tracker of your own, with an active subscription that you pay the
> tracker's provider for directly.

Today the only supported tracker is a **Garmin inReach**, read through its
MapShare feed (see [Fleet Management](../fleet-management/#trackers) for setup).

### Pick an inReach plan that tracks often enough

Wingbeat can only show what the inReach sends. Garmin sets how often an inReach may
send a tracking point by subscription plan, and the cheaper plans only allow a point
every **10 minutes** or longer. At that rate:

- flight tracks are coarse, and short hops may not show up as flights at all
- takeoffs and landings are detected up to 10 minutes late
- in-flight [signal-gap alerts](../notifications/) need a threshold above 10 minutes,
  so they can't catch a real gap quickly

Wingbeat polls each tracker about every 2 minutes and is tuned for **2-minute
tracking**. Choose a plan that allows it:

- **Personal plans:** only Garmin's top tier (Premium) allows 2-minute
  tracking. Essential and Standard are limited to 10 minutes or more.
- **Professional plans:** pick the 2-minute tracking option.

Then set the device's tracking interval to 2 minutes and turn tracking on before
each flight. Garmin changes its plan lineup from time to time, so check the
current interval limits on Garmin's site before you subscribe.

## Wingbeat is not an AFF provider

Government contract flying (US Forest Service, Department of the Interior, many
state fire agencies) often requires **Automated Flight Following (AFF)**.
Agency dispatchers watch aircraft on [aff.gov](https://www.aff.gov/), which takes
positions only from tracking vendors the government has approved.

**Wingbeat isn't an approved AFF provider, and an inReach can't feed AFF through
Wingbeat.** AFF's vendor requirements include position reports reaching the
government within 2 minutes, GPS precision data that inReach doesn't provide,
a dedicated heartbeat unit, 99.9% uptime, and a signed federal security
agreement. Seeing an aircraft in Wingbeat doesn't mean it shows up in AFF.

Wingbeat also isn't a certified flight following or flight locating system. It's
a tool to support the flight following procedures your operation already has.

### Using Wingbeat alongside an AFF-approved tracker

If you need AFF, carry a tracker that is already approved for it on an approved
provider's platform. For example, the Ground Control **RockAIR** is approved
through **TracPlus** and **v2track**, and both handle sending your positions to
AFF for you. Register the device and aircraft on aff.gov as your provider
directs.

Many approved providers can also forward the same positions to other systems.
TracPlus, for example, offers third-party feeds. That lets Wingbeat show the
same aircraft for your own fleet tracking, maintenance and duty logs, while your
provider stays responsible for AFF.

> [!NOTE]
> Wingbeat can't yet read these providers' feeds. The only tracker type it supports
> today is inReach MapShare. Adding an AFF provider's feed as a tracker type is possible
> future work. If you'd use it, email
> [wingbeat@dummthings.dev](mailto:wingbeat@dummthings.dev) and say which provider you're on.
