# Productier Metrics Glossary

## Action Score
- Formula: `100 - weighted penalties (overdue, blocked, stale, review SLA, due soon)`
- Caveat: heuristic prioritization metric, not an employee performance metric.
- Use it for: triaging immediate work-risk concentration.

## Net Flow
- Formula: `arrival rate - departure rate` per bucket.
- Caveat: short windows can be noisy; use with rolling mean and std band.
- Use it for: detecting systemic backlog drift.

## System Balance
- Formula: arrival, departure, and rolling net-flow variability (`±1σ`) across buckets.
- Caveat: single-bucket spikes can occur during bulk moves/releases; watch sustained direction and spread.
- Use it for: deciding when intake must slow down or throughput must increase.

## Predictability Confidence
- Formula: delivery-variance and throughput-stability driven score plus `P50/P85`.
- Caveat: projections are probabilistic ranges, not commitments.
- Use it for: communicating confidence in projected completion.

## Cycle/Lead Percentiles
- Formula: p50/p85/p95 over time buckets.
- Caveat: low sample buckets can skew tails.
- Use it for: tracking tail risk and queue health over time.

## Flow Efficiency
- Formula: `active work time / lead time`.
- Caveat: a high ratio can still hide long end-to-end time if work itself is large.
- Use it for: isolating queueing vs execution delay patterns.

## First-Pass Rate
- Formula: completed tasks without rework transitions divided by completed tasks.
- Caveat: depends on status-transition event quality and taxonomy discipline.
- Use it for: monitoring quality stability at completion boundaries.

## Reopen Rate
- Formula: `done -> active` transitions divided by completed tasks.
- Caveat: can increase during scope churn; check alongside scope volatility.
- Use it for: quality loop stability checks.

## Unblock Efficiency
- Formula: median unblock time + SLA hit rate + breach counts.
- Caveat: average-only views hide long-tail blocker pain.
- Use it for: improving response-to-blocker performance.

## Load Ratio
- Formula: `wip / capacity`.
- Caveat: capacity is proxy-based unless explicit per-user capacity is configured.
- Use it for: balancing team load and avoiding chronic overload.

## Schedule Variance
- Formula: `projected end - planned end` in days.
- Caveat: shifts as throughput or scope shifts.
- Use it for: identifying delivery date risk early.

## At-Risk Work
- Formula: overdue + blocked + aging WIP + owner/reviewer gaps.
- Caveat: aggregate signal; inspect category chips for root causes.
- Use it for: first-pass executive risk scan on Overview.

## On-Time Rate
- Formula: completed tasks delivered on/before due date in the selected period.
- Caveat: due-date hygiene strongly affects reliability.
- Use it for: tracking schedule reliability trend over time.

## Portfolio Health Score
- Formula: weighted composite of predictability, quality, blocker pressure, and workload balance.
- Caveat: composite can hide single-dimension regressions; inspect component subscores.
- Use it for: top-level executive health tracking across delivery quality and flow risk.

## Delivery Confidence Distribution
- Formula: count deliveries by confidence score bands (`high >= 75`, `medium 45..74`, `low < 45`).
- Caveat: confidence quality depends on delivery projection hygiene and scope linkage.
- Use it for: spotting concentration of low-confidence work before milestone dates.

## Forecast Bias
- Formula: mean signed schedule variance days across scoped deliveries.
- Caveat: negative (early) bias can still hide scope reduction behavior.
- Use it for: identifying systemic early/late planning bias across teams/products.

## Scope Volatility Burn
- Formula: trend of scope added after start against delivery outcomes and risk posture.
- Caveat: volatility can be intentional during discovery phases; compare with confidence trend.
- Use it for: detecting scope churn that erodes predictability.

## Risk Burndown
- Formula: week-over-week net change in at-risk work (`overdue + blocked + aging WIP + ownership gaps`).
- Caveat: single-week swings can be noisy; read trend and product/initiative breakdown together.
- Use it for: confirming whether risk is actually burning down or accumulating.

## Initiative Execution Confidence
- Formula: initiative-status score + linked delivery predictability - blocker pressure penalty.
- Caveat: sparse initiative-delivery links can understate confidence fidelity.
- Use it for: portfolio-level initiative execution tracking and escalation.

## Quality Cost Index
- Formula: weighted blend of rework rate, reopen rate, and escaped defects intensity.
- Caveat: high throughput periods can inflate counts; normalize against completed volume.
- Use it for: translating quality leakage into delivery-impact signal.

## Throughput Stability Index
- Formula: `100 - (volatility coefficient of completion throughput)`, clamped to `0..100`.
- Caveat: low-volume products can appear unstable with small absolute fluctuations.
- Use it for: assessing whether throughput is reliable enough for forecasting.

## Cross-Product Bottleneck Heatmap
- Formula: product bottleneck score from blocked-pressure and overload-pressure blend.
- Caveat: score is a concentration indicator, not a root-cause diagnosis.
- Use it for: locating org-level bottleneck clusters for rebalancing action.

## Customer-Impact Proxy
- Formula: weighted blend of critical feedback backlog pressure + p85 acknowledge/resolve SLA pressure.
- Caveat: requires lifecycle timestamps (`acknowledgedAt`, `resolvedAt`) for high confidence.
- Use it for: prioritizing customer-impacting reliability work in executive cadence.
