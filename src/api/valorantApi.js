import { safeFetch } from "./safeFetch";

const VALORANT_API_BASE_URL = "https://valorant-api.com/v1";
const METADATA_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

let metadataCache = null;
let metadataExpiresAt = 0;
let metadataRequest = null;

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase();
}

async function fetchValorantApi(endpoint, options = {}) {
  const response = await safeFetch(`${VALORANT_API_BASE_URL}${endpoint}`, {
    metrics: options.metrics,
    retries: 1,
    timeoutMs: 12000
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error("No se pudo obtener metadata visual de Valorant-API.");
  }

  return body?.data || [];
}

function indexByDisplayName(items) {
  return items.reduce((index, item) => {
    index[normalizeKey(item.displayName)] = item;
    return index;
  }, {});
}

function getCurrentAct(seasons) {
  const now = Date.now();
  const acts = seasons
    .filter((season) => season.type === "EAresSeasonType::Act")
    .sort((first, second) => new Date(second.startTime).getTime() - new Date(first.startTime).getTime());

  return (
    acts.find((act) => {
      const startsAt = new Date(act.startTime).getTime();
      const endsAt = new Date(act.endTime).getTime();

      return startsAt <= now && now <= endsAt;
    }) || acts[0] || null
  );
}

function indexCompetitiveTiers(tierSets) {
  const latestTierSet = tierSets.at(-1);
  const tiers = latestTierSet?.tiers || [];

  return tiers.reduce((index, tier) => {
    index[normalizeKey(tier.tierName)] = tier;
    return index;
  }, {});
}

export async function getValorantMetadata(options = {}) {
  if (metadataCache && metadataExpiresAt > Date.now()) {
    return metadataCache;
  }

  if (!metadataRequest) {
    metadataRequest = Promise.all([
      fetchValorantApi("/agents?isPlayableCharacter=true", options),
      fetchValorantApi("/maps", options),
      fetchValorantApi("/seasons", options),
      fetchValorantApi("/competitivetiers", options)
    ])
      .then(([agents, maps, seasons, competitiveTiers]) => {
        metadataCache = {
          agentsByName: indexByDisplayName(agents),
          mapsByName: indexByDisplayName(maps),
          currentAct: getCurrentAct(seasons),
          ranksByName: indexCompetitiveTiers(competitiveTiers)
        };
        metadataExpiresAt = Date.now() + METADATA_CACHE_TTL_MS;

        return metadataCache;
      })
      .finally(() => {
        metadataRequest = null;
      });
  }

  return metadataRequest;
}
