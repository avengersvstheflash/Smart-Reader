# OpenRouter Concurrency Diagnostic — 2026-10

## Methodology

This diagnostic evaluates the empirical stability, throughput, latency, and event-loop lag of OpenRouter API calls under bounded concurrency levels $N \in [1, 5]$.

- **Provider:** OpenRouter (`deepseek/deepseek-v4-flash` via `aiService.generateText`)
- **Sampling:** 8 requests per concurrency level ($8 \times 5 = 40$ requests total)
- **Prompts:** 8 distinct scientific/algorithmic concept prompts (~150 words target) to prevent identical-request caching
- **Parameters:** `temperature: 0.2`, `maxTokens: 200`, `reasoning: { enabled: false }`
- **Metrics:** Wall-clock duration, success count (`ok`), HTTP 429 count, HTTP 5xx count, latency mean/p95/max, Node event-loop p95/max delay (`monitorEventLoopDelay`)
- **Pacing:** 2,000ms cool-down pause between levels to clear token bucket burst allowances

## Results per N

| N | Requests | OK | 429 | 5xx | Other Err | Wall (ms) | Mean Latency (ms) | p95 Latency (ms) | Max Latency (ms) | Event Loop p95 (ms) | Event Loop Max (ms) |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 1 | 8 | 8 | 0 | 0 | 0 | 33602 | 4200 | 9910 | 9910 | 16 | 22 |
| 2 | 8 | 8 | 0 | 0 | 0 | 17516 | 4182 | 7349 | 7349 | 16 | 23 |
| 3 | 8 | 8 | 0 | 0 | 0 | 22407 | 5399 | 14187 | 14187 | 16 | 21 |
| 4 | 8 | 8 | 0 | 0 | 0 | 9251 | 4092 | 7813 | 7813 | 16 | 22 |
| 5 | 8 | 8 | 0 | 0 | 0 | 9806 | 3530 | 7127 | 7127 | 16 | 22 |

## Interpretation

- **N=1:** Completed in 33602ms (8/8 succeeded). Mean latency: 4200ms, p95 latency: 9910ms, max latency: 9910ms. 429 count: 0, 5xx count: 0. Event loop delay p95: 16ms (max: 22ms).
- **N=2:** Completed in 17516ms (8/8 succeeded). Mean latency: 4182ms, p95 latency: 7349ms, max latency: 7349ms. 429 count: 0, 5xx count: 0. Event loop delay p95: 16ms (max: 23ms).
- **N=3:** Completed in 22407ms (8/8 succeeded). Mean latency: 5399ms, p95 latency: 14187ms, max latency: 14187ms. 429 count: 0, 5xx count: 0. Event loop delay p95: 16ms (max: 21ms).
- **N=4:** Completed in 9251ms (8/8 succeeded). Mean latency: 4092ms, p95 latency: 7813ms, max latency: 7813ms. 429 count: 0, 5xx count: 0. Event loop delay p95: 16ms (max: 22ms).
- **N=5:** Completed in 9806ms (8/8 succeeded). Mean latency: 3530ms, p95 latency: 7127ms, max latency: 7127ms. 429 count: 0, 5xx count: 0. Event loop delay p95: 16ms (max: 22ms).

## Recommendation

**`RAISE_TO_5`**

All levels N=3, N=4, N=5 demonstrated 100% success (8/8 ok), zero 429 rate-limits, zero 5xx errors, and event loop p95 lag < 50ms.

### Concrete Metric Basis

- Level N=1: ok=8/8, 429=0, 5xx=0, meanLat=4200ms, p95Lat=9910ms, elP95=16ms
- Level N=2: ok=8/8, 429=0, 5xx=0, meanLat=4182ms, p95Lat=7349ms, elP95=16ms
- Level N=3: ok=8/8, 429=0, 5xx=0, meanLat=5399ms, p95Lat=14187ms, elP95=16ms
- Level N=4: ok=8/8, 429=0, 5xx=0, meanLat=4092ms, p95Lat=7813ms, elP95=16ms
- Level N=5: ok=8/8, 429=0, 5xx=0, meanLat=3530ms, p95Lat=7127ms, elP95=16ms

## Raw JSON Appendix

```json
[
  {
    "N": 1,
    "wallMs": 33602,
    "totalRequests": 8,
    "ok": 8,
    "count429": 0,
    "count5xx": 0,
    "otherErrors": 0,
    "meanLatencyMs": 4200,
    "p95LatencyMs": 9910,
    "maxLatencyMs": 9910,
    "eventLoopLagP95Ms": 16,
    "eventLoopLagMaxMs": 22
  },
  {
    "N": 2,
    "wallMs": 17516,
    "totalRequests": 8,
    "ok": 8,
    "count429": 0,
    "count5xx": 0,
    "otherErrors": 0,
    "meanLatencyMs": 4182,
    "p95LatencyMs": 7349,
    "maxLatencyMs": 7349,
    "eventLoopLagP95Ms": 16,
    "eventLoopLagMaxMs": 23
  },
  {
    "N": 3,
    "wallMs": 22407,
    "totalRequests": 8,
    "ok": 8,
    "count429": 0,
    "count5xx": 0,
    "otherErrors": 0,
    "meanLatencyMs": 5399,
    "p95LatencyMs": 14187,
    "maxLatencyMs": 14187,
    "eventLoopLagP95Ms": 16,
    "eventLoopLagMaxMs": 21
  },
  {
    "N": 4,
    "wallMs": 9251,
    "totalRequests": 8,
    "ok": 8,
    "count429": 0,
    "count5xx": 0,
    "otherErrors": 0,
    "meanLatencyMs": 4092,
    "p95LatencyMs": 7813,
    "maxLatencyMs": 7813,
    "eventLoopLagP95Ms": 16,
    "eventLoopLagMaxMs": 22
  },
  {
    "N": 5,
    "wallMs": 9806,
    "totalRequests": 8,
    "ok": 8,
    "count429": 0,
    "count5xx": 0,
    "otherErrors": 0,
    "meanLatencyMs": 3530,
    "p95LatencyMs": 7127,
    "maxLatencyMs": 7127,
    "eventLoopLagP95Ms": 16,
    "eventLoopLagMaxMs": 22
  }
]
```
