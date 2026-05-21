import { useMemo, useRef, useState } from "react";
import { fetchAccount, fetchMmr, fetchRecentMatches, hasHenrikApiKey } from "./api/henrikApi";
import { getValorantMetadata } from "./api/valorantApi";
import { getCooldownSeconds, RateLimitError } from "./api/safeFetch";
import { getDisplayValue, getRankInitials } from "./utils/formatters";
import {
  getAgentHighlights,
  getBestAgentsByMap,
  getBestPicksPerMap,
  getSeasonOverview
} from "./utils/aggregations";
import { filterCompetitiveMatches, filterMatchesByTimeWindow } from "./utils/competitive";
import { enrichMatchImages, getAgentPortrait, getRankIcon } from "./utils/images";
import { normalizeRecentMatches } from "./utils/stats";

const MAX_MATCHES_TO_LOAD = 30;
const SEARCH_DEBOUNCE_MS = 400;
const matchFilterOptions = [
  { id: "7", label: "Last 7 Days" },
  { id: "15", label: "Last 15 Days" },
  { id: "30", label: "Last 30 Days" },
  { id: "current-act", label: "Current Act" }
];

const statLabels = {
  region: "Region",
  accountLevel: "Account Level",
  currentRank: "Current Rank",
  rating: "RR / Rating",
  elo: "ELO"
};

function App() {
  const [riotName, setRiotName] = useState("");
  const [riotTag, setRiotTag] = useState("");
  const [playerStats, setPlayerStats] = useState(null);
  const [recentMatches, setRecentMatches] = useState([]);
  const [valorantMetadata, setValorantMetadata] = useState(null);
  const [selectedTimeWindow, setSelectedTimeWindow] = useState("15");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const debounceTimerRef = useRef(null);
  const isSearchRunningRef = useRef(false);
  const filteredMatches = useMemo(
    () =>
      filterMatchesByTimeWindow(
        recentMatches,
        selectedTimeWindow,
        valorantMetadata?.currentAct
      ).map((match) => enrichMatchImages(match, valorantMetadata)),
    [recentMatches, selectedTimeWindow, valorantMetadata]
  );
  const bestAgentsByMap = useMemo(
    () => getBestAgentsByMap(filteredMatches, valorantMetadata),
    [filteredMatches, valorantMetadata]
  );
  const agentHighlights = useMemo(
    () => getAgentHighlights(filteredMatches, valorantMetadata),
    [filteredMatches, valorantMetadata]
  );
  const recommendedPicks = useMemo(
    () => getBestPicksPerMap(filteredMatches, valorantMetadata),
    [filteredMatches, valorantMetadata]
  );
  const seasonOverview = useMemo(
    () => getSeasonOverview(filteredMatches, valorantMetadata),
    [filteredMatches, valorantMetadata]
  );
  const appStateClass = playerStats ? "dashboard-state" : isLoading ? "loading-state" : "landing-state";
  const heroAgent = agentHighlights.mostPlayedAgent?.agent;
  const heroBackground = heroAgent ? getAgentPortrait(heroAgent, valorantMetadata) : "";
  const rankIcon = getRankIcon(playerStats?.currentRank, valorantMetadata, playerStats?.rankImage);

  async function handleSearch(event) {
    event.preventDefault();

    const cleanName = riotName.trim();
    const cleanTag = riotTag.trim();

    window.clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = window.setTimeout(() => {
      runSearch(cleanName, cleanTag);
    }, SEARCH_DEBOUNCE_MS);
  }

  async function runSearch(cleanName, cleanTag) {
    if (isSearchRunningRef.current) {
      setError("Ya hay una busqueda en curso. Espera a que termine antes de iniciar otra.");
      return;
    }

    setError("");
    setPlayerStats(null);
    setRecentMatches([]);

    if (!cleanName || !cleanTag) {
      setError("Ingresa Riot Name y Riot Tag para buscar.");
      return;
    }

    if (!hasHenrikApiKey()) {
      setError(
        "VITE_HENRIK_API_KEY no esta disponible en runtime. Verifica que .env este en la raiz del proyecto, que la variable empiece con VITE_, y reinicia npm run dev para que Vite la vuelva a cargar."
      );
      return;
    }

    setIsLoading(true);
    isSearchRunningRef.current = true;
    const metrics = {
      requests: 0,
      pages: 0,
      startedAt: performance.now()
    };

    try {
      const encodedName = encodeURIComponent(cleanName);
      const encodedTag = encodeURIComponent(cleanTag);
      const [account, metadata] = await Promise.all([
        fetchAccount(encodedName, encodedTag, { metrics }),
        getValorantMetadata({ metrics })
      ]);
      const region = account?.region || "na";
      const cutoffDate = getOldestRequiredDate(metadata?.currentAct);
      const [mmr, matches] = await Promise.all([
        fetchMmr(region, encodedName, encodedTag, { metrics }),
        fetchRecentMatches(region, encodedName, encodedTag, {
          cutoffDate,
          maxMatches: MAX_MATCHES_TO_LOAD,
          metrics
        })
      ]);
      const displayName = account?.name || mmr?.account?.name || cleanName;
      const displayTag = account?.tag || mmr?.account?.tag || cleanTag;

      setPlayerStats({
        name: displayName,
        tag: displayTag,
        region,
        accountLevel: account?.account_level,
        currentRank: mmr?.current?.tier?.name,
        rating: mmr?.current?.rr,
        elo: mmr?.current?.elo,
        rankImage:
          mmr?.current?.tier?.image ||
          mmr?.current?.tier?.icon ||
          mmr?.current?.images?.large ||
          mmr?.current_data?.images?.large ||
          ""
      });
      setValorantMetadata(metadata);
      setRecentMatches(filterCompetitiveMatches(normalizeRecentMatches(matches, displayName, displayTag)));
    } catch (requestError) {
      if (requestError instanceof RateLimitError) {
        setError(`${requestError.message} Cooldown: ${getCooldownSeconds()}s. No se haran mas requests hasta que termine.`);
      } else {
        setError(requestError.message);
      }
    } finally {
      const elapsedMs = Math.round(performance.now() - metrics.startedAt);
      console.log("[HenrikDev Search Metrics]", {
        requests: metrics.requests,
        pagesDownloaded: metrics.pages,
        elapsedMs
      });
      isSearchRunningRef.current = false;
      setIsLoading(false);
    }
  }

  return (
    <main className={`app-shell ${appStateClass}`}>
      <WindowControls />

      <section className="app-panel" aria-label="Player search">
        {heroBackground && (
          <img className="dashboard-hero-bg" src={heroBackground} alt="" loading="lazy" />
        )}

        <div className="app-topbar">
          <div className="hero-topbar">
            <p className="hero-badge">Desktop Client</p>
          </div>

          <div className="app-heading">
            <h1>Valorant Stats App</h1>
            <p className="app-subtitle">Analytics Dashboard</p>
            <p className="app-credit">by Sebastian Barrueto Nolasco - ULima 2026</p>
          </div>
        </div>

        <form className="search-form" onSubmit={handleSearch}>
          <label className="field">
            <span>Riot Name</span>
            <input
              type="text"
              value={riotName}
              onChange={(event) => setRiotName(event.target.value)}
              placeholder="Henrik3"
              autoComplete="off"
            />
          </label>

          <label className="field">
            <span>Riot Tag</span>
            <input
              type="text"
              value={riotTag}
              onChange={(event) => setRiotTag(event.target.value)}
              placeholder="EUW3"
              autoComplete="off"
            />
          </label>

          <button type="submit" disabled={isLoading}>
            {isLoading && <span className="button-spinner" aria-hidden="true" />}
            <span>{isLoading ? "Buscando" : "Buscar"}</span>
          </button>
        </form>

        {isLoading && (
          <div className="loading-card" role="status" aria-live="polite">
            <div className="loader-mark" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <div>
              <strong>Loading player analytics...</strong>
              <span>Fetching competitive history...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="error-message" role="alert">
            {error}
          </div>
        )}

        {playerStats && (
          <div className="dashboard-layout">
            <aside className="player-sidebar" aria-label="Player profile">
              <section className="stats-card">
                <div className="player-hero">
                  <div className="rank-emblem" aria-label={getDisplayValue(playerStats.currentRank)}>
                    {rankIcon ? (
                      <img src={rankIcon} alt="" loading="lazy" />
                    ) : (
                      <span>{getRankInitials(playerStats.currentRank)}</span>
                    )}
                  </div>

                  <div>
                    <p className="result-label">Player profile</p>
                    <div className="player-title">
                      <span>{playerStats.name}</span>
                      <strong>#{playerStats.tag}</strong>
                    </div>
                    <p className="player-rank">{getDisplayValue(playerStats.currentRank)}</p>
                  </div>
                </div>

                <dl className="stats-grid">
                  {Object.entries(statLabels).map(([key, label]) => (
                    <div className={`stat-tile stat-tile-${key}`} key={key}>
                      <dt>{label}</dt>
                      <dd>
                        {key === "region"
                          ? getDisplayValue(playerStats[key]).toUpperCase()
                          : getDisplayValue(playerStats[key])}
                      </dd>
                    </div>
                  ))}
                  <div className="stat-tile">
                    <dt>Winrate</dt>
                    <dd>{seasonOverview ? `${seasonOverview.winrate}%` : "No data"}</dd>
                  </div>
                </dl>
              </section>
            </aside>

            <div className="dashboard-content">
              <section className="history-controls" aria-label="Match history filter">
                <div>
                  <p className="result-label">Analysis window</p>
                  <h2>Match Sample</h2>
                </div>

                <div className="filter-tabs">
                  {matchFilterOptions.map((option) => (
                    <button
                      className={selectedTimeWindow === option.id ? "filter-tab active" : "filter-tab"}
                      key={option.id}
                      type="button"
                      onClick={() => setSelectedTimeWindow(option.id)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </section>

              <section className="matches-section" aria-label="Recent matches">
                <div className="section-heading">
                  <p className="result-label">Match history</p>
                  <h2>Recent Matches</h2>
                </div>

                {filteredMatches.length > 0 ? (
                  <div className="matches-list">
                    {filteredMatches.map((match) => (
                      <article
                        className={`match-card match-card-${match.result.toLowerCase()}`}
                        key={match.id}
                        style={
                          match.mapImage
                            ? { "--match-map-image": `url(${match.mapImage})` }
                            : undefined
                        }
                      >
                        <div className="match-agent">
                          {match.agentFace ? (
                            <img src={match.agentFace} alt="" loading="lazy" />
                          ) : (
                            <span>No image</span>
                          )}
                        </div>

                        <div className="match-main">
                          <div className="match-title">
                            <span>{getDisplayValue(match.map)}</span>
                            <strong className={`match-result match-result-${match.result.toLowerCase()}`}>
                              {match.result}
                            </strong>
                          </div>
                          <div className="match-meta">
                            <span>{getDisplayValue(match.agent)}</span>
                            <span>{getDisplayValue(match.mode)}</span>
                            <span>{getDisplayValue(match.relativeDate)}</span>
                          </div>
                        </div>

                        <div className="match-stats">
                          <div>
                            <span>K / D / A</span>
                            <strong>
                              {getDisplayValue(match.kills)} / {getDisplayValue(match.deaths)} /{" "}
                              {getDisplayValue(match.assists)}
                            </strong>
                          </div>
                          <div>
                            <span>HS%</span>
                            <strong>
                              {match.headshotPercentage === null
                                ? "No disponible"
                                : `${match.headshotPercentage}%`}
                            </strong>
                          </div>
                          <div>
                            <span>ACS</span>
                            <strong>{getDisplayValue(match.acs)}</strong>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty-matches">
                    No hay partidas recientes disponibles para este jugador.
                  </div>
                )}
              </section>

              <section className="agents-section" aria-label="Season overview">
            <div className="section-heading">
              <p className="result-label">Competitive summary</p>
              <h2>Season Overview</h2>
            </div>

            {seasonOverview ? (
              <div className="overview-grid">
                <OverviewTile label="Total Matches" value={seasonOverview.totalMatches} />
                <OverviewTile label="Winrate" value={`${seasonOverview.winrate}%`} />
                <OverviewTile label="Average KD" value={seasonOverview.averageKd} />
                <OverviewTile label="Average ACS" value={seasonOverview.averageAcs} />
                <OverviewTile label="HS%" value={`${seasonOverview.headshotPercentage}%`} />
                <OverviewTile label="Wins / Losses" value={`${seasonOverview.wins} / ${seasonOverview.losses}`} />
                <OverviewTile label="Best Map" value={seasonOverview.bestMap?.map || "No data"} />
                <OverviewTile label="Worst Map" value={seasonOverview.worstMap?.map || "No data"} />
                <div className="overview-tile overview-agents">
                  <span>Most Played Agents</span>
                  <strong>
                    {seasonOverview.mostPlayedAgents.length
                      ? seasonOverview.mostPlayedAgents.map((agent) => agent.agent).join(", ")
                      : "No data"}
                  </strong>
                </div>
              </div>
            ) : (
              <div className="empty-matches">Not enough match data yet</div>
            )}
              </section>

              <section className="agents-section" aria-label="Best picks per map">
            <div className="section-heading">
              <p className="result-label">Personal map pool</p>
              <h2>Best Picks Per Map</h2>
            </div>

            <div className="map-picks-grid">
              {recommendedPicks.map((map) => (
                <article className="map-picks-card" key={map.map}>
                  {map.mapImage && <img className="map-card-image" src={map.mapImage} alt="" loading="lazy" />}
                  <div className="map-card-overlay" />
                  <div className="map-picks-content">
                    <h3>{map.map}</h3>
                    {map.picks.length ? (
                      <div className="pick-list">
                        {map.picks.map((pick) => (
                          <div className="pick-row" key={`${map.map}-${pick.agent}`}>
                            <div className="pick-portrait">
                              {pick.agentPortrait ? (
                                <img src={pick.agentIcon} alt="" loading="lazy" />
                              ) : (
                                <span>No image</span>
                              )}
                            </div>
                            <div>
                              <strong>{pick.agent}</strong>
                              <span>
                                {pick.winrate}% WR / {getDisplayValue(pick.averageAcs)} ACS /{" "}
                                {pick.matchesPlayed} matches
                              </span>
                            </div>
                            <span className={`confidence-badge ${getConfidenceClass(pick.confidence)}`}>
                              {pick.recommendationScore}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="empty-map-data">Not enough match data yet</div>
                    )}
                  </div>
                </article>
              ))}
            </div>
              </section>

              <section className="agents-section" aria-label="Best agents by map">
            <div className="section-heading">
              <p className="result-label">Map recommendations</p>
              <h2>Best Agents By Map</h2>
            </div>

            <div className="agent-highlights">
              <HighlightCard title="Most Played Agent" agent={agentHighlights.mostPlayedAgent} />
              <HighlightCard title="Best Winrate Agent" agent={agentHighlights.bestWinrateAgent} />
              <HighlightCard title="Highest ACS Agent" agent={agentHighlights.highestAcsAgent} />
            </div>

            <div className="agents-grid">
              {bestAgentsByMap.map((item) => (
                <article className="agent-map-card map-art-card" key={item.map}>
                  {item.mapImage && <img className="map-card-image" src={item.mapImage} alt="" loading="lazy" />}
                  <div className="map-card-overlay" />

                  <div className="agent-card-content">
                    <div className="agent-card-top">
                      <div className="best-agent-icon">
                        {item.bestAgent?.agentIcon ? (
                          <img src={item.bestAgent.agentIcon} alt="" loading="lazy" />
                        ) : (
                          <span>{item.bestAgent?.agent?.slice(0, 2).toUpperCase() || "--"}</span>
                        )}
                      </div>

                      <div>
                        <p>{item.map}</p>
                        <h3>{item.bestAgent?.agent || "Not enough data"}</h3>
                      </div>
                    </div>

                    {item.bestAgent ? (
                      <>
                        <div className="agent-performance">
                          <span className="winrate-badge">{item.bestAgent.winrate}% WR</span>
                          <span>{item.bestAgent.matchesPlayed} matches</span>
                          <span>{item.bestAgent.recommendationScore} score</span>
                          <span className={`confidence-badge ${getConfidenceClass(item.bestAgent.confidence)}`}>
                            {item.bestAgent.confidence}
                          </span>
                        </div>

                        <dl className="agent-metrics">
                          <div>
                            <dt>KDA Avg</dt>
                            <dd>{getDisplayValue(item.bestAgent.averageKda)}</dd>
                          </div>
                          <div>
                            <dt>ACS Avg</dt>
                            <dd>{getDisplayValue(item.bestAgent.averageAcs)}</dd>
                          </div>
                        </dl>
                      </>
                    ) : (
                      <div className="empty-map-data">Not enough match data yet</div>
                    )}
                  </div>
                </article>
              ))}
            </div>
              </section>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function HighlightCard({ title, agent }) {
  return (
    <article className="highlight-card">
      <p>{title}</p>
      {agent ? (
        <>
          <strong>{agent.agent}</strong>
          <span>
            {agent.matchesPlayed} matches / {agent.winrate}% WR / {getDisplayValue(agent.averageAcs)} ACS
          </span>
        </>
      ) : (
        <>
          <strong>No data</strong>
          <span>Not enough match data yet</span>
        </>
      )}
    </article>
  );
}

function OverviewTile({ label, value }) {
  return (
    <div className="overview-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function WindowControls() {
  const controls = globalThis.valorantStatsApp?.windowControls;

  if (!controls) {
    return null;
  }

  return (
    <div className="window-controls-bar" aria-label="Window controls">
      <button className="window-btn" type="button" aria-label="Minimize window" onClick={() => controls.minimize()}>
        -
      </button>
      <button className="window-btn" type="button" aria-label="Maximize window" onClick={() => controls.maximize()}>
        □
      </button>
      <button className="window-btn" type="button" aria-label="Close window" onClick={() => controls.close()}>
        ×
      </button>
    </div>
  );
}

function getConfidenceClass(confidence) {
  return confidence.toLowerCase().replaceAll(" ", "-");
}

function getOldestRequiredDate(currentAct) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const actStart = currentAct?.startTime ? new Date(currentAct.startTime) : null;

  if (actStart && !Number.isNaN(actStart.getTime()) && actStart < thirtyDaysAgo) {
    return actStart;
  }

  return thirtyDaysAgo;
}

export default App;
