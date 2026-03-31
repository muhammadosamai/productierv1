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
