const MAX_CONCURRENT_REQUESTS = 2;
const DEFAULT_TIMEOUT_MS = 12000;
const DEFAULT_RETRIES = 1;

let activeRequests = 0;
let cooldownUntil = 0;
const requestQueue = [];

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function runNextRequest() {
  if (activeRequests >= MAX_CONCURRENT_REQUESTS || requestQueue.length === 0) {
    return;
  }

  const next = requestQueue.shift();
  activeRequests += 1;

  next()
    .finally(() => {
      activeRequests -= 1;
      runNextRequest();
    });
}

function enqueueRequest(task) {
  return new Promise((resolve, reject) => {
    requestQueue.push(() => task().then(resolve).catch(reject));
    runNextRequest();
  });
}

function getRetryAfterMs(response) {
  const retryAfter = response.headers.get("retry-after");
  const parsedRetryAfter = Number(retryAfter);

  if (Number.isFinite(parsedRetryAfter) && parsedRetryAfter > 0) {
    return parsedRetryAfter * 1000;
  }

  return 60000;
}

export function isRateLimited() {
  return Date.now() < cooldownUntil;
}

export function getCooldownSeconds() {
  return Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
}

export class RateLimitError extends Error {
  constructor(message, retryAfterMs) {
    super(message);
    this.name = "RateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

export async function safeFetch(url, options = {}) {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    metrics,
    ...fetchOptions
  } = options;

  if (isRateLimited()) {
    throw new RateLimitError(
      `HenrikDev rate limit activo. Espera ${getCooldownSeconds()}s antes de buscar de nuevo.`,
      cooldownUntil - Date.now()
    );
  }

  return enqueueRequest(async () => {
    let lastError = null;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

      try {
        if (metrics) {
          metrics.requests += 1;
        }

        const response = await fetch(url, {
          ...fetchOptions,
          signal: controller.signal
        });

        if (response.status === 429) {
          const retryAfterMs = getRetryAfterMs(response);
          cooldownUntil = Date.now() + retryAfterMs;
          throw new RateLimitError(
            `HenrikDev rate limit alcanzado. Espera ${Math.ceil(retryAfterMs / 1000)}s antes de buscar de nuevo.`,
            retryAfterMs
          );
        }

        if (!response.ok && response.status >= 500 && attempt < retries) {
          await sleep(500 * (attempt + 1));
          continue;
        }

        return response;
      } catch (error) {
        lastError = error;

        if (error instanceof RateLimitError || attempt >= retries) {
          throw error;
        }

        await sleep(500 * (attempt + 1));
      } finally {
        window.clearTimeout(timeoutId);
      }
    }

    throw lastError;
  });
}

export function delay(ms) {
  return sleep(ms);
}
