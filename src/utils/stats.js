import { formatRelativeDate } from "./formatters";

export function calculateHeadshotPercentage(headshots, bodyshots, legshots) {
  const totalShots = Number(headshots || 0) + Number(bodyshots || 0) + Number(legshots || 0);

  if (!totalShots) {
    return null;
  }

  return Math.round((Number(headshots || 0) / totalShots) * 100);
}

export function calculateAcs(score, roundsPlayed) {
  if (!score || !roundsPlayed) {
    return null;
  }

  return Math.round(Number(score) / Number(roundsPlayed));
}

export function calculateKda(kills, deaths, assists) {
  const deathCount = Number(deaths || 0);
  const participation = Number(kills || 0) + Number(assists || 0);

  if (!participation && !deathCount) {
    return null;
  }

  if (!deathCount) {
    return participation;
  }

  return Number((participation / deathCount).toFixed(2));
}

function findPlayer(match, playerName, playerTag) {
  const normalizedName = playerName.toLowerCase();
  const normalizedTag = playerTag.toLowerCase();
  const players = Array.isArray(match?.players)
    ? match.players
    : match?.players?.all_players || [];

  return players.find(
    (player) =>
      player?.name?.toLowerCase() === normalizedName &&
      player?.tag?.toLowerCase() === normalizedTag
  );
}

function getPlayerTeam(player) {
  return player?.team_id || player?.team || "";
}

function getMatchResult(match, player) {
  const teamId = getPlayerTeam(player);

  if (!teamId) {
    return "Unknown";
  }

  if (Array.isArray(match?.teams)) {
    const team = match.teams.find((item) => item?.team_id === teamId || item?.team === teamId);
    return team?.won === true ? "Win" : team?.won === false ? "Loss" : "Unknown";
  }

  const team = match?.teams?.[teamId.toLowerCase()];
  return team?.has_won === true || team?.won === true ? "Win" : "Loss";
}

function getMapName(match) {
  return match?.metadata?.map?.name || match?.metadata?.map || "Mapa no disponible";
}

function getGameMode(match) {
  return match?.metadata?.queue?.name || match?.metadata?.mode || "Modo no disponible";
}

function getQueueName(match) {
  return match?.metadata?.queue?.name || match?.metadata?.queue || match?.metadata?.mode || "";
}

function getStartedAt(match) {
  return match?.metadata?.started_at || match?.metadata?.game_start;
}

function getRoundsPlayed(match) {
  return match?.metadata?.rounds_played || match?.rounds?.length || null;
}

export function normalizeRecentMatches(matches, playerName, playerTag) {
  if (!Array.isArray(matches)) {
    return [];
  }

  return matches.map((match) => {
    const player = findPlayer(match, playerName, playerTag);
    const stats = player?.stats || {};
    const agent = player?.agent?.name || player?.character || "Agente no disponible";

    return {
      id: match?.metadata?.match_id || match?.metadata?.matchid || crypto.randomUUID(),
      map: getMapName(match),
      agent,
      agentIcon: player?.assets?.agent?.small || player?.assets?.agent?.full || "",
      kills: stats.kills,
      deaths: stats.deaths,
      assists: stats.assists,
      kda: calculateKda(stats.kills, stats.deaths, stats.assists),
      headshotPercentage: calculateHeadshotPercentage(
        stats.headshots,
        stats.bodyshots,
        stats.legshots
      ),
      result: player ? getMatchResult(match, player) : "Unknown",
      mode: getGameMode(match),
      queue: getQueueName(match),
      startedAt: getStartedAt(match),
      relativeDate: formatRelativeDate(getStartedAt(match)),
      acs: calculateAcs(stats.score, getRoundsPlayed(match))
    };
  });
}
