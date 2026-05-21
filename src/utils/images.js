function normalizeKey(value) {
  return String(value || "").trim().toLowerCase();
}

export function getAgentMetadata(agentName, metadata) {
  return metadata?.agentsByName?.[normalizeKey(agentName)] || null;
}

export function getMapMetadata(mapName, metadata) {
  return metadata?.mapsByName?.[normalizeKey(mapName)] || null;
}

export function getRankIcon(rankName, metadata, fallback = "") {
  const rank = metadata?.ranksByName?.[normalizeKey(rankName)];

  return rank?.largeIcon || rank?.smallIcon || fallback;
}

export function getAgentIcon(agentName, metadata, fallback = "") {
  const agent = getAgentMetadata(agentName, metadata);

  return agent?.displayIconSmall || agent?.displayIcon || agent?.killfeedPortrait || fallback;
}

export function getAgentPortrait(agentName, metadata, fallback = "") {
  const agent = getAgentMetadata(agentName, metadata);

  return agent?.fullPortraitV2 || agent?.fullPortrait || agent?.bustPortrait || fallback;
}

export function getAgentFace(agentName, metadata, fallback = "") {
  const agent = getAgentMetadata(agentName, metadata);

  return agent?.displayIcon || agent?.displayIconSmall || agent?.killfeedPortrait || fallback;
}

export function getMapSplash(mapName, metadata, fallback = "") {
  const map = getMapMetadata(mapName, metadata);

  return map?.splash || map?.listViewIconTall || map?.listViewIcon || fallback;
}

export function enrichMatchImages(match, metadata) {
  return {
    ...match,
    agentIcon: getAgentIcon(match.agent, metadata, match.agentIcon),
    agentPortrait: getAgentPortrait(match.agent, metadata, match.agentIcon),
    agentFace: getAgentFace(match.agent, metadata, match.agentIcon),
    mapImage: getMapSplash(match.map, metadata)
  };
}
