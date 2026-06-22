type Scenario = {
  label: string;
  path: string;
  requests: number;
  weight?: number;
};

type ScenarioResult = {
  label: string;
  path: string;
  requests: number;
  concurrency: number;
  totalSeconds: number;
  requestsPerSecond: number;
  statusCounts: Map<number, number>;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  firstRedirectLocation: string | null;
};

const baseUrl = process.env.BENCH_BASE_URL ?? 'http://localhost:3000';
const concurrency = Number.parseInt(process.env.BENCH_CONCURRENCY ?? '20', 10);

const routeScenarios: Scenario[] = [
  { label: 'Home EN', path: '/en', requests: 300 },
  { label: 'Home NL', path: '/nl', requests: 300 },
  { label: 'Gallery', path: '/en/gallery', requests: 240 },
  { label: 'Map', path: '/en/map', requests: 240 },
  { label: 'Statistics', path: '/en/statistics', requests: 240 },
  { label: 'Timeline', path: '/en/timeline', requests: 240 },
  { label: 'Object SK-A-1671', path: '/en/object/SK-A-1671', requests: 240 },
  { label: 'Object SK-A-2630', path: '/en/object/SK-A-2630', requests: 240 },
];

const mixedScenario: Scenario[] = [
  { label: 'Home EN', path: '/en', requests: 0, weight: 18 },
  { label: 'Home NL', path: '/nl', requests: 0, weight: 8 },
  { label: 'Gallery', path: '/en/gallery', requests: 0, weight: 16 },
  { label: 'Map', path: '/en/map', requests: 0, weight: 12 },
  { label: 'Statistics', path: '/en/statistics', requests: 0, weight: 10 },
  { label: 'Timeline', path: '/en/timeline', requests: 0, weight: 10 },
  {
    label: 'Object SK-A-1671',
    path: '/en/object/SK-A-1671',
    requests: 0,
    weight: 18,
  },
  {
    label: 'Object SK-A-2630',
    path: '/en/object/SK-A-2630',
    requests: 0,
    weight: 8,
  },
];

async function main() {
  if (!Number.isFinite(concurrency) || concurrency <= 0) {
    throw new Error(
      `Invalid BENCH_CONCURRENCY: ${process.env.BENCH_CONCURRENCY}`,
    );
  }

  console.log(`Benchmark base URL: ${baseUrl}`);
  console.log(`Concurrency: ${concurrency}`);

  for (const scenario of routeScenarios) {
    const result = await runScenario(scenario, concurrency);
    printResult(result);
  }

  const mixedResult = await runMixedScenario(mixedScenario, concurrency, 1200);
  printResult(mixedResult);
}

async function runScenario(
  scenario: Scenario,
  workerCount: number,
): Promise<ScenarioResult> {
  return runRequests({
    label: scenario.label,
    pathProvider: () => scenario.path,
    requests: scenario.requests,
    concurrency: workerCount,
  });
}

async function runMixedScenario(
  scenarios: Scenario[],
  workerCount: number,
  totalRequests: number,
): Promise<ScenarioResult> {
  const expanded = scenarios.flatMap((scenario) =>
    Array(scenario.weight ?? 1).fill(scenario.path),
  );

  return runRequests({
    label: 'Mixed traffic',
    pathProvider: () => expanded[Math.floor(Math.random() * expanded.length)],
    requests: totalRequests,
    concurrency: workerCount,
  });
}

async function runRequests({
  label,
  pathProvider,
  requests,
  concurrency,
}: {
  label: string;
  pathProvider: () => string;
  requests: number;
  concurrency: number;
}): Promise<ScenarioResult> {
  const statusCounts = new Map<number, number>();
  const latencies: number[] = [];
  let nextRequest = 0;
  let firstPath = '';
  let firstRedirectLocation: string | null = null;

  const startedAt = performance.now();

  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const current = nextRequest++;
      if (current >= requests) return;

      const path = pathProvider();
      if (!firstPath) {
        firstPath = path;
      }

      const url = new URL(path, baseUrl);
      const requestStartedAt = performance.now();
      const response = await fetch(url, { redirect: 'manual' });
      const elapsedMs = performance.now() - requestStartedAt;

      latencies.push(elapsedMs);
      statusCounts.set(
        response.status,
        (statusCounts.get(response.status) ?? 0) + 1,
      );

      if (
        !firstRedirectLocation &&
        response.status >= 300 &&
        response.status < 400
      ) {
        firstRedirectLocation = response.headers.get('location');
      }

      await response.arrayBuffer();
    }
  });

  await Promise.all(workers);
  const totalSeconds = (performance.now() - startedAt) / 1000;
  latencies.sort((left, right) => left - right);

  return {
    label,
    path: firstPath,
    requests,
    concurrency,
    totalSeconds,
    requestsPerSecond: requests / totalSeconds,
    statusCounts,
    p50Ms: percentile(latencies, 0.5),
    p95Ms: percentile(latencies, 0.95),
    p99Ms: percentile(latencies, 0.99),
    firstRedirectLocation,
  };
}

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) return 0;
  const index = Math.min(values.length - 1, Math.floor(values.length * ratio));
  return values[index];
}

function printResult(result: ScenarioResult) {
  const statusSummary = Array.from(result.statusCounts.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([status, count]) => `${status}:${count}`)
    .join(', ');

  console.log('');
  console.log(`${result.label} (${result.path})`);
  console.log(
    `  requests: ${result.requests} @ concurrency ${result.concurrency}`,
  );
  console.log(`  duration: ${result.totalSeconds.toFixed(2)}s`);
  console.log(`  throughput: ${result.requestsPerSecond.toFixed(2)} req/s`);
  console.log(
    `  latency: p50 ${result.p50Ms.toFixed(2)}ms, p95 ${result.p95Ms.toFixed(2)}ms, p99 ${result.p99Ms.toFixed(2)}ms`,
  );
  console.log(`  statuses: ${statusSummary}`);

  if (result.firstRedirectLocation) {
    console.log(`  redirect target: ${result.firstRedirectLocation}`);
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(message);
  process.exit(1);
});
