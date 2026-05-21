export const COMPETITIVE_MAP_POOL = [
  "Ascent",
  "Bind",
  "Haven",
  "Split",
  "Lotus",
  "Sunset",
  "Icebox",
  "Pearl"
];

const COMPETITIVE_QUEUE_NAMES = new Set([
  "competitive",
  "ranked",
  "standard competitive"
]);

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

export function isCompetitiveMap(mapName) {
  return COMPETITIVE_MAP_POOL.map(normalize).includes(normalize(mapName));
}

export function isCompetitiveMatch(match) {
  const queue = normalize(match.queue || match.mode);

  return COMPETITIVE_QUEUE_NAMES.has(queue) && isCompetitiveMap(match.map);
}

export function filterCompetitiveMatches(matches) {
  if (!Array.isArray(matches)) {
    return [];
  }

  return matches.filter(isCompetitiveMatch);
}

function getMatchDate(match) {
  if (!match.startedAt) {
    return null;
  }

  const date = typeof match.startedAt === "number" ? new Date(match.startedAt * 1000) : new Date(match.startedAt);

  return Number.isNaN(date.getTime()) ? null : date;
}

export function filterMatchesByTimeWindow(matches, windowId, currentAct) {
  if (!Array.isArray(matches)) {
    return [];
  }

  if (windowId === "current-act") {
    const startsAt = currentAct?.startTime ? new Date(currentAct.startTime) : null;
    const endsAt = currentAct?.endTime ? new Date(currentAct.endTime) : null;

    if (!startsAt || !endsAt || Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      return matches;
    }

    return matches.filter((match) => {
      const matchDate = getMatchDate(match);

      return matchDate && matchDate >= startsAt && matchDate <= endsAt;
    });
  }

  const days = Number(windowId);

  if (!days) {
    return matches;
  }

  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

  return matches.filter((match) => {
    const matchDate = getMatchDate(match);

    return matchDate && matchDate.getTime() >= cutoff;
  });
}
