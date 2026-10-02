/**
 * scripts/diagnostic-concurrency.js
 *
 * Empirical OpenRouter concurrency diagnostic (Phase 5.7.2 Session 3b-2).
 * Ramps concurrency N from 1 to 5 against real OpenRouter calls, measuring
 * 429 rate, 5xx rate, per-call latency, event-loop lag, and success rate.
 */

'use strict';

const { runWithConcurrency } = require('../backend/services/synthesis/promisePool');
const aiService = require('../backend/services/ai/aiService');
const { monitorEventLoopDelay } = require('perf_hooks');
const fs = require('fs');
const path = require('path');

const LEVELS = [1, 2, 3, 4, 5];
const REQUESTS_PER_LEVEL = 8;

const PROMPTS = [
  'Explain gradient descent in 150 words.',
  'Explain conjugate priors in 150 words.',
  'Explain Markov chains in 150 words.',
  'Explain singular value decomposition in 150 words.',
  'Explain dynamic programming in 150 words.',
  'Explain Fourier transform in 150 words.',
  'Explain transformer self-attention in 150 words.',
  'Explain simulated annealing in 150 words.',
];

function mean(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function percentile(arr, p) {
  if (!arr || arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

async function runLevel(N) {
  const histogram = monitorEventLoopDelay({ resolution: 10 });
  histogram.enable();
  const t0 = Date.now();
  const results = await runWithConcurrency(PROMPTS.slice(0, REQUESTS_PER_LEVEL), N, async (prompt) => {
    const reqStart = Date.now();
    try {
      const res = await aiService.generateText(prompt, {
        temperature: 0.2,
        maxTokens: 200,
        reasoning: { enabled: false },
      });
      return { ok: true, latencyMs: Date.now() - reqStart, textLength: res?.text?.length || 0 };
    } catch (err) {
      let status = err.status || err.response?.status || null;
      if (!status && typeof err.message === 'string') {
        const m = err.message.match(/OpenRouter (\d{3})/);
        if (m) status = parseInt(m[1], 10);
      }
      return {
        ok: false,
        latencyMs: Date.now() - reqStart,
        status,
        error: err.message,
      };
    }
  });
  histogram.disable();
  const latencies = results.map(r => r.latencyMs);
  return {
    N,
    wallMs: Date.now() - t0,
    totalRequests: results.length,
    ok: results.filter(r => r.ok).length,
    count429: results.filter(r => r.status === 429 || (typeof r.error === 'string' && r.error.includes('429'))).length,
    count5xx: results.filter(r => (r.status >= 500 && r.status < 600) || (typeof r.error === 'string' && /5\d{2}/.test(r.error))).length,
    otherErrors: results.filter(r => !r.ok && !(r.status === 429 || (typeof r.error === 'string' && r.error.includes('429'))) && !((r.status >= 500 && r.status < 600) || (typeof r.error === 'string' && /5\d{2}/.test(r.error)))).length,
    meanLatencyMs: Math.round(mean(latencies)),
    p95LatencyMs: Math.round(percentile(latencies, 95)),
    maxLatencyMs: latencies.length ? Math.max(...latencies) : 0,
    eventLoopLagP95Ms: Math.round(histogram.percentile(95) / 1e6),
    eventLoopLagMaxMs: Math.round(histogram.max / 1e6),
  };
}

function computeRecommendation(report) {
  const rByN = new Map(report.map(r => [r.N, r]));
  const r1 = rByN.get(1);
  const r2 = rByN.get(2);
  const r3 = rByN.get(3);
  const r4 = rByN.get(4);
  const r5 = rByN.get(5);

  const reasons = [];

  const any5xx = report.some(r => r.count5xx > 0);
  if (any5xx) {
    const levels = report.filter(r => r.count5xx > 0).map(r => r.N).join(',');
    reasons.push(`Detected 5xx server errors at N=[${levels}].`);
  }

  const throttlingAtLowN = (r1 && r1.count429 > 0) || (r2 && r2.count429 > 0);
  if (throttlingAtLowN) {
    reasons.push(`Rate limit 429 occurred at conservative baseline N<=2 (N1: ${r1?.count429 || 0}, N2: ${r2?.count429 || 0}).`);
  }

  if (r2 && r2.ok < 8) {
    reasons.push(`Incomplete success rate at baseline N=2 (${r2.ok}/8 ok).`);
  }

  const highLag = report.some(r => r.N >= 3 && r.eventLoopLagP95Ms > 100);
  if (highLag) {
    const lagLevels = report.filter(r => r.N >= 3 && r.eventLoopLagP95Ms > 100).map(r => `N=${r.N} (${r.eventLoopLagP95Ms}ms)`).join(', ');
    reasons.push(`Event loop p95 lag exceeded 100ms: ${lagLevels}.`);
  }

  if (any5xx || throttlingAtLowN || (r2 && r2.ok < 8) || highLag) {
    return {
      recommendation: 'KEEP_DEFAULT_2',
      rationale: `Keeping default concurrency of 2. Triggering conditions:\n- ${reasons.join('\n- ')}`,
    };
  }

  function isClean(r) {
    return r && r.ok === 8 && r.count429 === 0 && r.count5xx === 0 && r.eventLoopLagP95Ms < 50;
  }

  if (isClean(r3) && isClean(r4) && isClean(r5)) {
    return {
      recommendation: 'RAISE_TO_5',
      rationale: 'All levels N=3, N=4, N=5 demonstrated 100% success (8/8 ok), zero 429 rate-limits, zero 5xx errors, and event loop p95 lag < 50ms.',
    };
  }
  if (isClean(r3) && isClean(r4)) {
    return {
      recommendation: 'RAISE_TO_4',
      rationale: 'Levels N=3 and N=4 demonstrated 100% success (8/8 ok), zero 429 rate-limits, zero 5xx errors, and event loop p95 lag < 50ms, while N=5 exhibited degradation.',
    };
  }
  if (isClean(r3)) {
    return {
      recommendation: 'RAISE_TO_3',
      rationale: 'Level N=3 demonstrated 100% success (8/8 ok), zero 429 rate-limits, zero 5xx errors, and event loop p95 lag < 50ms, while higher levels exhibited degradation.',
    };
  }

  return {
    recommendation: 'INSUFFICIENT_SIGNAL',
    rationale: 'Measurements did not meet clean elevation criteria (8/8 ok, zero 429/5xx, elP95 < 50ms) but also did not breach explicit baseline failure rules. Insufficient signal to safely raise default.',
  };
}

function buildArtifact(report) {
  const { recommendation, rationale } = computeRecommendation(report);

  let md = `# OpenRouter Concurrency Diagnostic — 2026-10\n\n`;
  md += `## Methodology\n\n`;
  md += `This diagnostic evaluates the empirical stability, throughput, latency, and event-loop lag of OpenRouter API calls under bounded concurrency levels $N \\in [1, 5]$.\n\n`;
  md += `- **Provider:** OpenRouter (\`deepseek/deepseek-v4-flash\` via \`aiService.generateText\`)\n`;
  md += `- **Sampling:** 8 requests per concurrency level ($8 \\times 5 = 40$ requests total)\n`;
  md += `- **Prompts:** 8 distinct scientific/algorithmic concept prompts (~150 words target) to prevent identical-request caching\n`;
  md += `- **Parameters:** \`temperature: 0.2\`, \`maxTokens: 200\`, \`reasoning: { enabled: false }\`\n`;
  md += `- **Metrics:** Wall-clock duration, success count (\`ok\`), HTTP 429 count, HTTP 5xx count, latency mean/p95/max, Node event-loop p95/max delay (\`monitorEventLoopDelay\`)\n`;
  md += `- **Pacing:** 2,000ms cool-down pause between levels to clear token bucket burst allowances\n\n`;

  md += `## Results per N\n\n`;
  md += `| N | Requests | OK | 429 | 5xx | Other Err | Wall (ms) | Mean Latency (ms) | p95 Latency (ms) | Max Latency (ms) | Event Loop p95 (ms) | Event Loop Max (ms) |\n`;
  md += `|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|\n`;

  for (const r of report) {
    md += `| ${r.N} | ${r.totalRequests} | ${r.ok} | ${r.count429} | ${r.count5xx} | ${r.otherErrors} | ${r.wallMs} | ${r.meanLatencyMs} | ${r.p95LatencyMs} | ${r.maxLatencyMs} | ${r.eventLoopLagP95Ms} | ${r.eventLoopLagMaxMs} |\n`;
  }
  md += `\n`;

  md += `## Interpretation\n\n`;
  for (const r of report) {
    md += `- **N=${r.N}:** Completed in ${r.wallMs}ms (${r.ok}/${r.totalRequests} succeeded). Mean latency: ${r.meanLatencyMs}ms, p95 latency: ${r.p95LatencyMs}ms, max latency: ${r.maxLatencyMs}ms. 429 count: ${r.count429}, 5xx count: ${r.count5xx}. Event loop delay p95: ${r.eventLoopLagP95Ms}ms (max: ${r.eventLoopLagMaxMs}ms).\n`;
  }
  md += `\n`;

  const r1 = report.find(r => r.N === 1);
  const r2 = report.find(r => r.N === 2);
  if ((r1 && r1.count429 > 0) || (r2 && r2.count429 > 0)) {
    md += `> [!CRITICAL]\n> **Critical Finding:** HTTP 429 (Rate Limit / Too Many Requests) was triggered at baseline concurrency level N <= 2 (N1: ${r1?.count429 || 0}, N2: ${r2?.count429 || 0}). This indicates OpenRouter account tier throttling even under conservative operation.\n\n`;
  }

  md += `## Recommendation\n\n`;
  md += `**\`${recommendation}\`**\n\n`;
  md += `${rationale}\n\n`;

  md += `### Concrete Metric Basis\n\n`;
  for (const r of report) {
    md += `- Level N=${r.N}: ok=${r.ok}/${r.totalRequests}, 429=${r.count429}, 5xx=${r.count5xx}, meanLat=${r.meanLatencyMs}ms, p95Lat=${r.p95LatencyMs}ms, elP95=${r.eventLoopLagP95Ms}ms\n`;
  }
  md += `\n`;

  md += `## Raw JSON Appendix\n\n`;
  md += `\`\`\`json\n`;
  md += JSON.stringify(report, null, 2);
  md += `\n\`\`\`\n`;

  return md;
}

async function main() {
  const report = [];
  for (const N of LEVELS) {
    console.log(`\n[Diagnostic] Ramping N=${N}...`);
    const r = await runLevel(N);
    report.push(r);
    console.log(JSON.stringify(r, null, 2));
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log('\n=== SUMMARY ===');
  console.log('N | reqs | ok | 429 | 5xx | meanLat | p95Lat | maxLat | elP95 | elMax');
  for (const r of report) {
    console.log(`${r.N} | ${r.totalRequests} | ${r.ok} | ${r.count429} | ${r.count5xx} | ${r.meanLatencyMs} | ${r.p95LatencyMs} | ${r.maxLatencyMs} | ${r.eventLoopLagP95Ms} | ${r.eventLoopLagMaxMs}`);
  }

  const artifactPath = path.resolve('docs/DIAGNOSTIC_2026-10_concurrency.md');
  const artifact = buildArtifact(report);
  fs.writeFileSync(artifactPath, artifact, 'utf8');
  console.log(`\nWrote artifact: ${artifactPath}`);
}

main().catch(err => {
  console.error('Diagnostic failed:', err);
  process.exit(1);
});
