import { delay, safeFetch } from "./safeFetch";

const HENRIK_API_BASE_URL = "https://api.henrikdev.xyz/valorant";
const MATCH_PAGE_SIZE = 10;
const MAX_MATCH_PAGES = 3;
const MAX_MATCHES_TO_LOAD = 30;
const PLAYER_CACHE_TTL_MS = 2 * 60 * 1000;

const playerCache = new Map();
const inFlightRequests = new Map();

export function createHenrikHeaders() {
  return {
    Authorization: import.meta.env.VITE_HENRIK_API_KEY
  };
}

export function hasHenrikApiKey() {
  return Boolean(import.meta.env.VITE_HENRIK_API_KEY);
}

function getCachedValue(key) {
  const cached = playerCache.get(key);

  if (!cached || cached.expiresAt <= Date.now()) {
    playerCache.delete(key);
    return null;
  }

  return cached.value;
}

function setCachedValue(key, value) {
  playerCache.set(key, {
    value,
    expiresAt: Date.now() + PLAYER_CACHE_TTL_MS
  });
}

async function withPlayerCache(key, loader) {
  const cached = getCachedValue(key);

  if (cached) {
    return cached;
  }

  if (inFlightRequests.has(key)) {
    return inFlightRequests.get(key);
  }

  const request = loader()
    .then((value) => {
      setCachedValue(key, value);
      return value;
    })
    .finally(() => {
      inFlightRequests.delete(key);
    });

  inFlightRequests.set(key, request);
  return request;
}

export async function fetchHenrik(endpoint, options = {}) {
  const response = await safeFetch(`${HENRIK_API_BASE_URL}${endpoint}`, {
    headers: createHenrikHeaders(),
    metrics: options.metrics,
    retries: 1,
    timeoutMs: 12000
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const apiMessage = body?.errors?.[0]?.message || body?.message;

    if (response.status === 404) {
      throw new Error("No se encontro un jugador con ese Riot ID.");
    }

    if (response.status === 401 || response.status === 403) {
      throw new Error("La API rechazo la solicitud. Revisa tu clave de HenrikDev.");
    }

    throw new Error(apiMessage || "No se pudieron obtener los datos del jugador.");
  }

  return body?.data;
}

export function fetchAccount(name, tag, options = {}) {
  return withPlayerCache(`account:${name}:${tag}`, () => {
    return fetchHenrik(`/v2/account/${name}/${tag}`, options);
  });
}

export function fetchMmr(region, name, tag, options = {}) {
  return withPlayerCache(`mmr:${region}:${name}:${tag}`, () => {
    return fetchHenrik(`/v3/mmr/${region}/pc/${name}/${tag}`, options);
  });
}

function getMatchStartedAt(match) {
  const value = match?.metadata?.started_at || match?.metadata?.game_start;

  if (!value) {
    return null;
  }

  const date = typeof value === "number" ? new Date(value * 1000) : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function hasReachedCutoff(matches, cutoffDate) {
  if (!cutoffDate || !matches.length) {
    return false;
  }

  return matches.some((match) => {
    const startedAt = getMatchStartedAt(match);

    return startedAt && startedAt < cutoffDate;
  });
}

export async function fetchRecentMatches(region, name, tag, options = {}) {
  const maxMatches = Math.min(options.maxMatches || MAX_MATCHES_TO_LOAD, MAX_MATCHES_TO_LOAD);
  const cutoffDate = options.cutoffDate || null;
  const metrics = options.metrics;
  const cacheKey = `matches:${region}:${name}:${tag}:${cutoffDate?.toISOString() || "all"}:${maxMatches}`;

  return withPlayerCache(cacheKey, async () => {
    const allMatches = [];
    const maxPages = Math.min(MAX_MATCH_PAGES, Math.ceil(maxMatches / MATCH_PAGE_SIZE));

    for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
      const start = pageIndex * MATCH_PAGE_SIZE;
      const page = await fetchHenrik(
        `/v4/matches/${region}/pc/${name}/${tag}?mode=competitive&size=${MATCH_PAGE_SIZE}&start=${start}`,
        { metrics }
      );
      const matches = Array.isArray(page) ? page : [];

      if (metrics) {
        metrics.pages += 1;
      }
      allMatches.push(...matches);

      if (matches.length < MATCH_PAGE_SIZE || hasReachedCutoff(matches, cutoffDate)) {
        break;
      }

      if (pageIndex < maxPages - 1) {
        await delay(500);
      }
    }

    return allMatches.slice(0, maxMatches);
  });
}
