import { COMPETITIVE_MAP_POOL } from "./competitive";
import { getAgentFace, getAgentIcon, getAgentPortrait, getMapSplash } from "./images";

function average(values) {
  const validValues = values.filter((value) => value !== null && value !== undefined);

  if (!validValues.length) {
    return null;
  }

  return validValues.reduce((total, value) => total + Number(value), 0) / validValues.length;
}

function standardDeviation(values) {
  const validValues = values.filter((value) => value !== null && value !== undefined);

  if (validValues.length < 2) {
    return 0;
  }

  const mean = average(validValues);
  const variance =
    validValues.reduce((total, value) => total + (Number(value) - mean) ** 2, 0) /
    validValues.length;

  return Math.sqrt(variance);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getReliability(matchesPlayed) {
  return clamp(matchesPlayed / 10, 0.22, 1);
}

function getConfidence(matchesPlayed, score) {
  if (matchesPlayed >= 8 && score >= 58) {
    return "High Confidence";
  }

  if (matchesPlayed >= 4 && score >= 40) {
    return "Medium Confidence";
  }

  return "Low Confidence";
}

export function getFinalRecommendationScore(agentStats) {
  const reliability = getReliability(agentStats.matchesPlayed);
  const winrateScore = agentStats.winrate * 0.26;
  const acsScore = clamp((agentStats.averageAcs || 0) / 300, 0, 1.15) * 30;
  const kdaScore = clamp((agentStats.averageKda || 0) / 3, 0, 1.15) * 24;
  const volumeScore = clamp(agentStats.matchesPlayed / 14, 0, 1) * 14;
  const consistencyPenalty = clamp(agentStats.performanceDeviation / 130, 0, 1) * 16;

  return Number(
    ((winrateScore + acsScore + kdaScore + volumeScore - consistencyPenalty) * reliability).toFixed(2)
  );
}

function createAgentBucket(match, mapName = null) {
  return {
    map: mapName || match.map,
    agent: match.agent,
    agentIcon: match.agentIcon,
    matchesPlayed: 0,
    wins: 0,
    kdas: [],
    acsValues: [],
    performanceValues: [],
    maps: new Map()
  };
}

function addMapPerformance(bucket, match) {
  if (!bucket.maps.has(match.map)) {
    bucket.maps.set(match.map, {
      map: match.map,
      matchesPlayed: 0,
      wins: 0,
      acsValues: []
    });
  }

  const mapStats = bucket.maps.get(match.map);
  mapStats.matchesPlayed += 1;
  mapStats.wins += match.result === "Win" ? 1 : 0;

  if (match.acs !== null && match.acs !== undefined) {
    mapStats.acsValues.push(match.acs);
  }
}

function addMatchToBucket(bucket, match) {
  bucket.matchesPlayed += 1;
  bucket.wins += match.result === "Win" ? 1 : 0;

  if (match.kda !== null && match.kda !== undefined) {
    bucket.kdas.push(match.kda);
  }

  if (match.acs !== null && match.acs !== undefined) {
    bucket.acsValues.push(match.acs);
  }

  bucket.performanceValues.push((match.acs || 0) + (match.kda || 0) * 35);
  addMapPerformance(bucket, match);
}

function summarizeAgentBucket(bucket, metadata) {
  const averageKda = average(bucket.kdas);
  const averageAcs = average(bucket.acsValues);
  const performanceDeviation = standardDeviation(bucket.performanceValues);
  const winrate = bucket.matchesPlayed ? Math.round((bucket.wins / bucket.matchesPlayed) * 100) : 0;
  const summary = {
    map: bucket.map,
    agent: bucket.agent,
    agentIcon: getAgentFace(bucket.agent, metadata, bucket.agentIcon),
    agentPortrait: getAgentPortrait(bucket.agent, metadata, bucket.agentIcon),
    matchesPlayed: bucket.matchesPlayed,
    winrate,
    averageKda: averageKda === null ? null : Number(averageKda.toFixed(2)),
    averageAcs: averageAcs === null ? null : Math.round(averageAcs),
    performanceDeviation: Math.round(performanceDeviation),
    maps: Array.from(bucket.maps.values()).map((mapStats) => ({
      ...mapStats,
      winrate: mapStats.matchesPlayed ? Math.round((mapStats.wins / mapStats.matchesPlayed) * 100) : 0,
      averageAcs: average(mapStats.acsValues)
    }))
  };
  const recommendationScore = getFinalRecommendationScore(summary);

  return {
    ...summary,
    recommendationScore,
    confidence: getConfidence(summary.matchesPlayed, recommendationScore)
  };
}

function isUsableMatch(match) {
  return Boolean(match.map && match.agent && match.agent !== "Agente no disponible");
}

function sortByScore(firstAgent, secondAgent) {
  return (
    secondAgent.recommendationScore - firstAgent.recommendationScore ||
    secondAgent.matchesPlayed - firstAgent.matchesPlayed ||
    secondAgent.winrate - firstAgent.winrate
  );
}

export function summarizeAgents(matches, metadata) {
  if (!Array.isArray(matches)) {
    return [];
  }

  const agents = new Map();

  matches.forEach((match) => {
    if (!isUsableMatch(match)) {
      return;
    }

    if (!agents.has(match.agent)) {
      agents.set(match.agent, createAgentBucket(match));
    }

    addMatchToBucket(agents.get(match.agent), match);
  });

  return Array.from(agents.values()).map((bucket) => summarizeAgentBucket(bucket, metadata));
}

export function getAgentHighlights(matches, metadata) {
  const agents = summarizeAgents(matches, metadata);

  if (!agents.length) {
    return {
      mostPlayedAgent: null,
      bestWinrateAgent: null,
      highestAcsAgent: null
    };
  }

  return {
    mostPlayedAgent: [...agents].sort((first, second) => {
      return second.matchesPlayed - first.matchesPlayed || sortByScore(first, second);
    })[0],
    bestWinrateAgent: [...agents].sort((first, second) => {
      return second.winrate - first.winrate || second.matchesPlayed - first.matchesPlayed;
    })[0],
    highestAcsAgent: [...agents].sort((first, second) => {
      return (second.averageAcs || 0) - (first.averageAcs || 0) || second.matchesPlayed - first.matchesPlayed;
    })[0]
  };
}

export function getBestAgentsByMap(matches, metadata) {
  const maps = new Map();

  COMPETITIVE_MAP_POOL.forEach((mapName) => {
    maps.set(mapName, {
      map: mapName,
      mapImage: getMapSplash(mapName, metadata),
      bestAgent: null
    });
  });

  if (!Array.isArray(matches) || matches.length < 2) {
    return Array.from(maps.values());
  }

  matches.forEach((match) => {
    if (!isUsableMatch(match) || !maps.has(match.map)) {
      return;
    }

    const mapEntry = maps.get(match.map);

    if (!mapEntry.agentBuckets) {
      mapEntry.agentBuckets = new Map();
    }

    if (!mapEntry.agentBuckets.has(match.agent)) {
      mapEntry.agentBuckets.set(match.agent, createAgentBucket(match, match.map));
    }

    addMatchToBucket(mapEntry.agentBuckets.get(match.agent), match);
  });

  return Array.from(maps.values()).map((mapEntry) => {
    const agents = Array.from(mapEntry.agentBuckets?.values() || [])
      .map((bucket) => summarizeAgentBucket(bucket, metadata))
      .sort(sortByScore);

    return {
      map: mapEntry.map,
      mapImage: mapEntry.mapImage,
      bestAgent: agents[0] || null
    };
  });
}

export function getBestPicksPerMap(matches, metadata) {
  const maps = new Map();

  COMPETITIVE_MAP_POOL.forEach((mapName) => {
    maps.set(mapName, {
      map: mapName,
      mapImage: getMapSplash(mapName, metadata),
      picks: []
    });
  });

  if (!Array.isArray(matches) || !matches.length) {
    return Array.from(maps.values());
  }

  matches.forEach((match) => {
    if (!isUsableMatch(match) || !maps.has(match.map)) {
      return;
    }

    const mapEntry = maps.get(match.map);

    if (!mapEntry.agentBuckets) {
      mapEntry.agentBuckets = new Map();
    }

    if (!mapEntry.agentBuckets.has(match.agent)) {
      mapEntry.agentBuckets.set(match.agent, createAgentBucket(match, match.map));
    }

    addMatchToBucket(mapEntry.agentBuckets.get(match.agent), match);
  });

  return Array.from(maps.values()).map((mapEntry) => {
    const picks = Array.from(mapEntry.agentBuckets?.values() || [])
      .map((bucket) => summarizeAgentBucket(bucket, metadata))
      .sort(sortByScore)
      .slice(0, 3);

    return {
      map: mapEntry.map,
      mapImage: mapEntry.mapImage,
      picks
    };
  });
}

export function getSeasonOverview(matches, metadata) {
  if (!Array.isArray(matches) || !matches.length) {
    return null;
  }

  const wins = matches.filter((match) => match.result === "Win").length;
  const losses = matches.filter((match) => match.result === "Loss").length;
  const kills = matches.reduce((total, match) => total + Number(match.kills || 0), 0);
  const deaths = matches.reduce((total, match) => total + Number(match.deaths || 0), 0);
  const headshotValues = matches
    .map((match) => match.headshotPercentage)
    .filter((value) => value !== null && value !== undefined);
  const mapSummaries = getBestPicksPerMap(matches, metadata)
    .filter((map) => map.picks.length)
    .map((map) => {
      const mapMatches = matches.filter((match) => match.map === map.map);
      const mapWins = mapMatches.filter((match) => match.result === "Win").length;

      return {
        map: map.map,
        winrate: mapMatches.length ? Math.round((mapWins / mapMatches.length) * 100) : 0,
        matchesPlayed: mapMatches.length
      };
    });
  const sortedMaps = [...mapSummaries].sort((first, second) => {
    return second.winrate - first.winrate || second.matchesPlayed - first.matchesPlayed;
  });
  const agents = summarizeAgents(matches, metadata)
    .sort((first, second) => second.matchesPlayed - first.matchesPlayed)
    .slice(0, 3);

  return {
    totalMatches: matches.length,
    wins,
    losses,
    winrate: Math.round((wins / matches.length) * 100),
    averageKd: deaths ? Number((kills / deaths).toFixed(2)) : kills,
    averageAcs: Math.round(average(matches.map((match) => match.acs)) || 0),
    headshotPercentage: Math.round(average(headshotValues) || 0),
    mostPlayedAgents: agents,
    bestMap: sortedMaps[0] || null,
    worstMap: sortedMaps.at(-1) || null
  };
}

function getPickReason(agent) {
  const strongMaps = agent.maps
    .filter((map) => map.matchesPlayed >= 1 && (map.winrate >= 50 || (map.averageAcs || 0) >= 210))
    .sort((first, second) => {
      return second.matchesPlayed - first.matchesPlayed || second.winrate - first.winrate;
    })
    .slice(0, 2)
    .map((map) => map.map);

  if (strongMaps.length >= 2) {
    return `Strong performance on ${strongMaps[0]} and ${strongMaps[1]}`;
  }

  if ((agent.averageAcs || 0) >= 230 && agent.winrate >= 50) {
    return "High ACS and consistent winrate";
  }

  if (agent.matchesPlayed >= 5) {
    return "Reliable sample with steady performance";
  }

  return "Promising results, but needs more competitive data";
}

export function getRecommendedPicks(matches, metadata) {
  return summarizeAgents(matches, metadata)
    .sort(sortByScore)
    .slice(0, 3)
    .map((agent) => ({
      ...agent,
      reason: getPickReason(agent)
    }));
}
