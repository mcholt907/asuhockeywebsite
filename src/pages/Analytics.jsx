import React, { useState } from "react";
import { Helmet } from "react-helmet-async";
import { snapshot, sources, players, games } from "../data/analyticsSnapshot";
import { share, perGame, finishing, filterGames } from "../utils/analytics";
import "./Analytics.css";

const number = (value, digits = 1) =>
  value == null ? "—" : value.toFixed(digits);
const signed = (value) =>
  value == null ? "—" : `${value > 0 ? "+" : ""}${number(value)}`;
const pct = (value) => (value == null ? "—" : `${number(value)}%`);

function SourceLink({ href, children }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children} <span aria-hidden="true">↗</span>
    </a>
  );
}

function Metric({ label, value, note, testId }) {
  return (
    <div className="analytics-metric">
      <span>{label}</span>
      <strong data-testid={testId}>{value}</strong>
      <p>{note}</p>
    </div>
  );
}

function ShareBar({ label, value, detail }) {
  return (
    <div className="analytics-share-row">
      <div>
        <span>{label}</span>
        <strong>{pct(value)}</strong>
      </div>
      <div className="analytics-share-track" aria-hidden="true">
        <span style={{ width: `${value ?? 0}%` }} />
        <i />
      </div>
      <small>{detail}</small>
    </div>
  );
}

function TeamView() {
  const [situation, setSituation] = useState("even");
  const split = snapshot.situations[situation];
  const corsi = share(split.attempts, split.attemptsAgainst);
  const fenwick = share(split.unblocked, split.unblockedAgainst);
  return (
    <>
      <div className="analytics-section-heading">
        <div>
          <h2>The territorial picture</h2>
          <p>Look past the final score. Who is generating the attempts?</p>
        </div>
        <label className="analytics-field">
          Game situation
          <select
            value={situation}
            onChange={(e) => setSituation(e.target.value)}
          >
            {Object.entries(snapshot.situations).map(([key, item]) => (
              <option key={key} value={key}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="analytics-metrics">
        <Metric
          label="Corsi • attempt share"
          value={pct(corsi)}
          testId="corsi-value"
          note={`${split.attempts.toLocaleString("en-US")} for / ${split.attemptsAgainst.toLocaleString("en-US")} against`}
        />
        <Metric
          label="Fenwick • unblocked share"
          value={pct(fenwick)}
          note="Removes blocked attempts"
        />
        <Metric
          label="Attempt differential"
          value={String(split.attempts - split.attemptsAgainst)}
          note={`${split.label} • season total`}
        />
        <Metric
          label="Games in season"
          value={String(snapshot.gamesPlayed)}
          note="2025–26 completed season"
        />
      </div>
      <div className="analytics-team-grid">
        <section className="analytics-panel">
          <div className="analytics-panel-heading">
            <h3>ASU’s share of the play</h3>
            <span>{split.label}</span>
          </div>
          <div className="analytics-chart-key">
            <span>ASU share</span>
            <span>50% = equal share</span>
          </div>
          <ShareBar
            label="All attempts (CF%)"
            value={corsi}
            detail="On target + missed + blocked"
          />
          <ShareBar
            label="Unblocked attempts (FF%)"
            value={fenwick}
            detail="On target + missed"
          />
          <div className="analytics-axis" aria-hidden="true">
            <span>0%</span>
            <span>50%</span>
            <span>100%</span>
          </div>
          <p className="analytics-footnote">
            The center line is an equal split of events. These measures describe
            volume, not shot quality or time with the puck.
          </p>
        </section>
        <aside className="analytics-reading">
          <span className="analytics-reading-label">Reading the numbers</span>
          <h3>
            More defending.
            <br />
            Less attacking.
          </h3>
          <p>
            ASU generated {number(corsi)} of every 100 attempts in this
            situation. Opponents had the larger share of the shot volume.
          </p>
          <p>
            Compare this with game-level expected goals to see whether the
            quality of chances tells a different story.
          </p>
          <div className="analytics-reading-rule" />
          <p className="analytics-footnote">
            {situation === "close"
              ? "Close: within one goal in periods 1–2, or tied in period 3, at even strength."
              : situation === "even"
                ? "Even strength is the provider’s category; it is not an isolated 5-on-5 sample."
                : "All situations includes special teams. Use even strength for a more comparable territorial view."}
          </p>
        </aside>
      </div>
      <section className="analytics-panel analytics-context">
        <div>
          <h3>The scoreboard context</h3>
          <p>
            Full season • all situations • unaffected by the situation filter
          </p>
        </div>
        <div>
          <strong>
            {snapshot.goals}–{snapshot.goalsAgainst}
          </strong>
          <span>Goals for / against</span>
        </div>
        <div>
          <strong>{pct(share(snapshot.shots, snapshot.shotsAgainst))}</strong>
          <span>Shots on goal share</span>
        </div>
        <div>
          <strong>{pct(snapshot.powerPlay)}</strong>
          <span>Power play</span>
        </div>
        <div>
          <strong>{pct(snapshot.penaltyKill)}</strong>
          <span>Penalty kill</span>
        </div>
      </section>
      <p className="analytics-source-line">
        Snapshot source:{" "}
        <SourceLink href={sources.team}>CHN team statistics</SourceLink>
      </p>
    </>
  );
}

function GameView() {
  const [venue, setVenue] = useState("All");
  const [selectedId, setSelectedId] = useState(games[0].id);
  const filtered = filterGames(games, venue);
  const selected =
    filtered.find((game) => game.id === selectedId) || filtered[0];
  return (
    <>
      <div className="analytics-section-heading">
        <div>
          <h2>The result and the chances</h2>
          <p>
            Final eight games of 2025–26. All situations, including special
            teams.
          </p>
        </div>
        <label className="analytics-field">
          Venue
          <select value={venue} onChange={(e) => setVenue(e.target.value)}>
            <option>All</option>
            <option>Home</option>
            <option>Away</option>
          </select>
        </label>
      </div>
      <div className="analytics-game-layout">
        <section className="analytics-panel analytics-game-chart">
          <div className="analytics-panel-heading">
            <h3>Expected goals by game</h3>
            <div className="analytics-legend">
              <span>
                <i />
                ASU
              </span>
              <span>
                <i />
                Opponent
              </span>
            </div>
          </div>
          <p className="analytics-footnote">
            Select a game to compare its chances with its result. Bar heights
            share a 0–5 xG scale.
          </p>
          <div className="analytics-game-bars">
            {[...filtered].reverse().map((game) => (
              <button
                key={game.id}
                className={`analytics-game-column ${selected.id === game.id ? "is-selected" : ""}`}
                aria-pressed={selected.id === game.id}
                onClick={() => setSelectedId(game.id)}
                aria-label={`${game.date}, ${game.opponent}, ${game.venue}, ASU xG ${number(game.xg, 2)}, opponent xG ${number(game.xga, 2)}`}
              >
                <span className="analytics-bar-pair" aria-hidden="true">
                  <i style={{ height: `${(game.xg / 5) * 100}%` }} />
                  <i style={{ height: `${(game.xga / 5) * 100}%` }} />
                </span>
                <span>{game.date}</span>
                <small>
                  {game.opponent === "Western Michigan"
                    ? "WMU"
                    : game.opponent === "St. Cloud State"
                      ? "SCSU"
                      : game.opponent}
                </small>
              </button>
            ))}
          </div>
          <p className="analytics-footnote">
            Provider xG estimates the quality of chances. It is not a predicted
            final score.
          </p>
        </section>
        <section
          className="analytics-game-detail"
          aria-label="Selected game"
          aria-live="polite"
        >
          <p>
            {selected.date}, 2026 • {selected.venue}
          </p>
          <h3>
            ASU <span>vs.</span> {selected.opponent}
          </h3>
          <div className="analytics-score">
            <strong>
              {selected.goals}
              <span>–</span>
              {selected.against}
            </strong>
            <span>
              {selected.goals > selected.against ? "Win" : "Loss"} • Final
            </span>
          </div>
          <dl>
            <div>
              <dt>Expected goals</dt>
              <dd>
                {number(selected.xg, 2)} / {number(selected.xga, 2)}
              </dd>
            </div>
            <div>
              <dt>xG differential</dt>
              <dd>{signed(selected.xg - selected.xga)}</dd>
            </div>
            <div>
              <dt>Shots on goal</dt>
              <dd>
                {selected.shots} / {selected.shotsAgainst}
              </dd>
            </div>
            <div>
              <dt>ASU shot share</dt>
              <dd>{pct(share(selected.shots, selected.shotsAgainst))}</dd>
            </div>
          </dl>
          <small>Paired values are ASU / opponent.</small>
        </section>
      </div>
      <div className="analytics-callout">
        <strong>One game is a small sample.</strong>
        <p>
          A team can win while trailing in expected goals. Finishing,
          goaltending and game state all matter; this eight-game window is not a
          season trend.
        </p>
      </div>
      <p className="analytics-source-line">
        8 games in snapshot / {filtered.length} shown •{" "}
        <SourceLink href={sources.games}>CHN game log & box scores</SourceLink>
      </p>
    </>
  );
}

const sortValue = (player, key) =>
  key === "attemptsPerGame"
    ? perGame(player.attempts, player.gp)
    : key === "finish"
      ? finishing(player.goals, player.xg)
      : player[key];
const playerColumns = [
  ["gp", "GP", "games played"],
  ["attempts", "Attempts", "attempts"],
  ["attemptsPerGame", "Att/GP", "attempts per game"],
  ["goals", "Goals", "goals"],
  ["xg", "xG", "expected goals"],
  ["finish", "G − xG", "goals minus expected"],
];

function PlayerView() {
  const [position, setPosition] = useState("All");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState({
    key: "attemptsPerGame",
    descending: true,
  });
  const filtered = players
    .filter(
      (p) =>
        (position === "All" || p.position === position) &&
        p.name.toLowerCase().includes(search.toLowerCase().trim()),
    )
    .sort(
      (a, b) =>
        (sortValue(a, sort.key) - sortValue(b, sort.key)) *
          (sort.descending ? -1 : 1) || a.name.localeCompare(b.name),
    );
  const setColumn = (key) =>
    setSort({ key, descending: sort.key === key ? !sort.descending : true });
  return (
    <>
      <div className="analytics-section-heading">
        <div>
          <h2>Who is creating offense?</h2>
          <p>Eight selected skaters • season totals • all situations</p>
        </div>
      </div>
      <div className="analytics-player-controls">
        <label className="analytics-field">
          Search players
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a player…"
          />
        </label>
        <label className="analytics-field">
          Position
          <select
            value={position}
            onChange={(e) => setPosition(e.target.value)}
          >
            <option value="All">All skaters</option>
            <option value="F">Forwards</option>
            <option value="D">Defensemen</option>
          </select>
        </label>
        <span>
          {filtered.length} of {players.length} selected skaters
        </span>
      </div>
      <section className="analytics-panel analytics-player-panel">
        <div
          className="analytics-table-scroll"
          tabIndex="0"
          role="region"
          aria-label="Scrollable player statistics"
        >
          <table className="analytics-table" aria-label="Player analytics">
            <thead>
              <tr>
                <th scope="col">Player</th>
                {playerColumns.map(([key, title, label]) => (
                  <th
                    key={key}
                    scope="col"
                    aria-sort={
                      sort.key === key
                        ? sort.descending
                          ? "descending"
                          : "ascending"
                        : "none"
                    }
                  >
                    <button
                      onClick={() => setColumn(key)}
                      aria-label={`Sort by ${label}`}
                    >
                      {title}
                      <span aria-hidden="true">
                        {sort.key === key
                          ? sort.descending
                            ? " ↓"
                            : " ↑"
                          : " ↕"}
                      </span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.name}>
                  <th scope="row">
                    {p.name}
                    <span>{p.position === "F" ? "Forward" : "Defense"}</span>
                  </th>
                  <td>{p.gp}</td>
                  <td>{p.attempts}</td>
                  <td>{number(perGame(p.attempts, p.gp), 2)}</td>
                  <td>{p.goals}</td>
                  <td>{number(p.xg)}</td>
                  <td
                    className={
                      finishing(p.goals, p.xg) >= 0 ? "analytics-positive" : ""
                    }
                  >
                    {signed(finishing(p.goals, p.xg))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <p className="analytics-empty" role="status">
            No players match these filters.
          </p>
        )}
      </section>
      <div className="analytics-player-explain">
        <section className="analytics-panel">
          <h3>Volume and finishing</h3>
          <p>
            Attempts per game shows how often a player shoots, including misses
            and blocks. G − xG compares goals with the provider’s expected goals
            estimate.
          </p>
          <p>
            A positive number means more goals than expected. It can reflect
            finishing skill or variation; it is not proof of sustainable
            performance.
          </p>
        </section>
        <section className="analytics-panel">
          <h3>Individual attempts ≠ on-ice Corsi</h3>
          <p>
            These attempts belong to the shooter. They do not include all events
            while that player is on the ice. Ice time, role and linemates affect
            the comparison.
          </p>
          <p>
            Eight skaters are a research sample, not a complete roster or a team
            leaderboard. Player on-ice shares and per-60 rates need additional
            validated data.
          </p>
        </section>
      </div>
      <p className="analytics-source-line">
        Sources:{" "}
        <SourceLink href={sources.players}>CHN player totals</SourceLink> ·{" "}
        <SourceLink href={sources.advanced}>
          CHN individual attempts & xG
        </SourceLink>
      </p>
    </>
  );
}

function MethodsView() {
  return (
    <>
      <div className="analytics-section-heading">
        <div>
          <h2>Useful numbers. Visible limits.</h2>
          <p>Where the data comes from, what it means, and what comes next.</p>
        </div>
      </div>
      <div className="analytics-methods-grid">
        <section className="analytics-panel">
          <span className="analytics-status">Included in this prototype</span>
          <h3>A dated research snapshot</h3>
          <p>
            2025–26 season totals for ASU, eight selected skaters and the final
            eight games. Manually verified {snapshot.verified}; no automatic
            refresh.
          </p>
          <ul className="analytics-source-list">
            <li>
              <SourceLink href={sources.team}>
                CHN team totals & splits
              </SourceLink>
            </li>
            <li>
              <SourceLink href={sources.players}>CHN player totals</SourceLink>
            </li>
            <li>
              <SourceLink href={sources.advanced}>
                CHN advanced player metrics
              </SourceLink>
            </li>
            <li>
              <SourceLink href={sources.games}>CHN game log</SourceLink>
            </li>
            <li>
              <SourceLink href={sources.methodology}>
                CHN glossary & coverage
              </SourceLink>
            </li>
          </ul>
        </section>
        <section className="analytics-panel">
          <span className="analytics-status analytics-status-muted">
            Provider model
          </span>
          <h3>Expected goals, with context</h3>
          <p>
            CHN weights shots using three-year national shooting rates from six
            shooting zones. Its college model has less detail than NHL models,
            and should be treated as an estimate.
          </p>
          <p>
            We display CHN’s xG directly. We have not trained a model, audited
            every shot location, or verified event completeness. Goals minus xG
            is descriptive, not a forecast.
          </p>
          <p>
            Published coverage start dates do not guarantee every game has
            complete data.
          </p>
        </section>
        <section className="analytics-panel">
          <span className="analytics-status analytics-status-muted">
            Next data priority
          </span>
          <h3>Validate before going live</h3>
          <p>
            Use{" "}
            <SourceLink href={sources.official}>
              ASU Athletics box scores & season PDFs
            </SourceLink>{" "}
            to check game totals. Confirm provider access and redistribution
            terms before adding an automated feed; a supported public API was
            not confirmed.
          </p>
          <p>
            A live version needs per-game coverage checks, freshness timestamps
            and explicit missing values. Provider totals can differ across
            views; do not silently combine them.
          </p>
        </section>
        <section className="analytics-panel">
          <span className="analytics-status analytics-status-muted">
            Needs more data
          </span>
          <h3>The next layer of analysis</h3>
          <p>
            Goalie goals saved above expected, player on-ice xG share, isolated
            5-on-5 rates, zone entries and shot maps need aligned event and
            ice-time data.
          </p>
          <p>
            These are valuable follow-ups. This prototype leaves them
            unavailable until the inputs and definitions can be verified.
          </p>
        </section>
      </div>
      <section className="analytics-panel analytics-glossary">
        <h3>A quick guide to the metrics</h3>
        <dl>
          <div>
            <dt>Corsi share (CF%)</dt>
            <dd>
              100 × ASU attempts / both teams’ attempts. Includes shots on
              target, misses and blocks.
            </dd>
          </div>
          <div>
            <dt>Fenwick share (FF%)</dt>
            <dd>The same share after removing blocked attempts.</dd>
          </div>
          <div>
            <dt>Shot share</dt>
            <dd>
              100 × ASU shots on goal / both teams’ shots on goal. Distinct from
              attempt share.
            </dd>
          </div>
          <div>
            <dt>xG differential</dt>
            <dd>
              ASU expected goals minus opponent expected goals, within the same
              game.
            </dd>
          </div>
          <div>
            <dt>Attempts / GP</dt>
            <dd>
              A player’s total attempts divided by games played. This does not
              adjust for ice time.
            </dd>
          </div>
          <div>
            <dt>Goals minus xG</dt>
            <dd>
              Actual goals minus provider expected goals, using the same season
              and situation.
            </dd>
          </div>
        </dl>
      </section>
    </>
  );
}

const views = [
  ["team", "Team"],
  ["games", "Games"],
  ["players", "Players"],
  ["methods", "Sources & methods"],
];

export default function Analytics() {
  const [view, setView] = useState("team");
  return (
    <div className="analytics-page">
      <Helmet>
        <title>ASU Hockey Advanced Analytics Prototype | Forks Up Pucks</title>
        <meta
          name="description"
          content="Explore ASU hockey shot share, game expected goals and player shot creation in a sourced 2025–26 analytics prototype."
        />
        <meta name="robots" content="noindex, follow" />
        <link rel="canonical" href="https://forksuppucks.com/analytics/" />
      </Helmet>
      <section className="analytics-hero">
        <div className="analytics-rink" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
        <div className="analytics-hero-copy">
          <span className="analytics-prototype">Research prototype</span>
          <h1>Advanced Analytics</h1>
          <p>Beyond the score. Inside Sun Devil hockey.</p>
        </div>
        <div className="analytics-season">
          <strong>{snapshot.season} season</strong>
          <span>{snapshot.gamesPlayed} games • completed season</span>
        </div>
      </section>
      <div className="analytics-snapshot-note">
        <span aria-hidden="true">◷</span>
        <p>
          <strong>Historical snapshot.</strong> Verified {snapshot.verified}.
          Team season totals, 8 selected skaters and 8 games.{" "}
          <button onClick={() => setView("methods")}>
            See sources & coverage
          </button>
        </p>
      </div>
      <div
        className="analytics-view-nav"
        role="group"
        aria-label="Analytics views"
      >
        {views.map(([id, label]) => (
          <button
            key={id}
            aria-pressed={view === id}
            onClick={() => setView(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="analytics-view" key={view}>
        {view === "team" ? (
          <TeamView />
        ) : view === "games" ? (
          <GameView />
        ) : view === "players" ? (
          <PlayerView />
        ) : (
          <MethodsView />
        )}
      </div>
      <div className="analytics-endnote">
        <span>Forks Up Pucks / Analytics Lab</span>
        <span>A clearer view of the game.</span>
      </div>
    </div>
  );
}
