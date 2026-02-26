// src/pages/Alumni.jsx
// V3: Displays all team entries per player with individual stats
import React, { useState, useEffect } from 'react';
import { getAlumni } from '../services/api';
import './Alumni.css';

function Alumni() {
    const [alumni, setAlumni] = useState({ skaters: [], goalies: [] });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState('skaters');

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                setError(null);
                const data = await getAlumni();
                setAlumni(data);
            } catch (err) {
                console.error('Error fetching alumni:', err);
                setError('Failed to load alumni data.');
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    const currentList = activeTab === 'skaters' ? alumni.skaters : alumni.goalies;

    // Count unique players
    const uniqueCount = (list) => {
        const ids = new Set(list.map(p => p.playerId));
        return ids.size;
    };

    if (loading) {
        return (
            <div className="page-container alumni-page">
                <p className="loading-message">Tracking down the alumni...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="page-container alumni-page">
                <p className="error-message">{error}</p>
            </div>
        );
    }

    return (
        <div className="page-container alumni-page">
            <title>Alumni | Forks Up Pucks – ASU Sun Devils Hockey</title>
            <meta name="description" content="Where are they now? Follow former ASU Sun Devils Hockey players in their professional careers." />
            <meta property="og:title" content="Alumni | Forks Up Pucks – ASU Sun Devils Hockey" />
            <meta property="og:description" content="Where are they now? Follow former ASU Sun Devils Hockey players in their professional careers." />
            <meta property="og:url" content="https://forksuppucks.com/alumni" />
            <meta name="twitter:title" content="Alumni | Forks Up Pucks – ASU Sun Devils Hockey" />
            <meta name="twitter:description" content="Where are they now? Follow former ASU Sun Devils Hockey players in their professional careers." />
            <link rel="canonical" href="https://forksuppucks.com/alumni" />
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{
                __html: JSON.stringify({
                  "@context": "https://schema.org",
                  "@type": "BreadcrumbList",
                  "itemListElement": [
                    { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://forksuppucks.com" },
                    { "@type": "ListItem", "position": 2, "name": "Alumni", "item": "https://forksuppucks.com/alumni" }
                  ]
                })
              }}
            />
            <div className="alumni-header">
                <h1>Where Are They Now?</h1>
                <p className="subtitle">Former Sun Devils Playing Professionally</p>
            </div>

            {/* Tab Toggle */}
            <div className="alumni-controls">
                <div className="position-filter">
                    <button
                        className={activeTab === 'skaters' ? 'active' : ''}
                        onClick={() => setActiveTab('skaters')}
                    >
                        Skaters ({uniqueCount(alumni.skaters || [])})
                    </button>
                    <button
                        className={activeTab === 'goalies' ? 'active' : ''}
                        onClick={() => setActiveTab('goalies')}
                    >
                        Goalies ({uniqueCount(alumni.goalies || [])})
                    </button>
                </div>
            </div>

            {/* Alumni Table */}
            <div className="alumni-content">
                {currentList.length === 0 ? (
                    <div className="no-data">
                        <p>No {activeTab} found.</p>
                    </div>
                ) : (
                    <div className="alumni-table-container">
                        <table className="alumni-table">
                            <thead>
                                <tr>
                                    <th className="rank-col">#</th>
                                    <th>Player</th>
                                    <th>Team</th>
                                    <th>League</th>
                                    {activeTab === 'skaters' ? (
                                        <>
                                            <th className="stat-col">GP</th>
                                            <th className="stat-col">G</th>
                                            <th className="stat-col">A</th>
                                            <th className="stat-col">P</th>
                                            <th className="stat-col">PIM</th>
                                        </>
                                    ) : (
                                        <>
                                            <th className="stat-col">GP</th>
                                            <th className="stat-col">GAA</th>
                                            <th className="stat-col">SV%</th>
                                        </>
                                    )}
                                </tr>
                            </thead>
                            <tbody>
                                {currentList.map((entry, idx) => {
                                    // Check if this is a continuation row (same player as previous)
                                    const prevEntry = idx > 0 ? currentList[idx - 1] : null;
                                    const isPlayerContinuation = prevEntry && prevEntry.playerId === entry.playerId;
                                    const isTotals = entry.isTotals || entry.league === 'totals';

                                    return (
                                        <tr
                                            key={`${entry.playerId}-${entry.team}-${idx}`}
                                            className={`${isPlayerContinuation ? 'continuation-row' : ''} ${isTotals ? 'totals-row' : ''}`}
                                        >
                                            <td className="rank-cell">
                                                {!isPlayerContinuation ? (
                                                    <span className="rank-number">
                                                        {currentList.filter((e, i) =>
                                                            i < idx &&
                                                            (i === 0 || currentList[i - 1].playerId !== e.playerId)
                                                        ).length + 1}.
                                                    </span>
                                                ) : null}
                                            </td>
                                            <td className="player-name-cell">
                                                {!isPlayerContinuation ? (
                                                    <a
                                                        href={entry.playerUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="player-link"
                                                    >
                                                        {entry.name} <span className="position-badge">({entry.position})</span>
                                                    </a>
                                                ) : null}
                                            </td>
                                            <td className="team-cell">
                                                {isTotals ? (
                                                    <span className="totals-label">totals</span>
                                                ) : entry.teamUrl ? (
                                                    <a
                                                        href={entry.teamUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="team-link"
                                                    >
                                                        {entry.team}
                                                    </a>
                                                ) : (
                                                    entry.team || '-'
                                                )}
                                            </td>
                                            <td className="league-cell">
                                                {!isTotals && entry.leagueUrl ? (
                                                    <a
                                                        href={entry.leagueUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="league-link"
                                                    >
                                                        {entry.league}
                                                    </a>
                                                ) : (
                                                    !isTotals ? entry.league : ''
                                                )}
                                            </td>
                                            {activeTab === 'skaters' ? (
                                                <>
                                                    <td className="stat-cell">{entry.gp || '-'}</td>
                                                    <td className="stat-cell">{entry.g || '-'}</td>
                                                    <td className="stat-cell">{entry.a || '-'}</td>
                                                    <td className={`stat-cell ${isTotals ? 'stat-highlight' : ''}`}>{entry.tp || '-'}</td>
                                                    <td className="stat-cell">{entry.pim || '-'}</td>
                                                </>
                                            ) : (
                                                <>
                                                    <td className="stat-cell">{entry.gp || '-'}</td>
                                                    <td className="stat-cell">{entry.gaa || '-'}</td>
                                                    <td className="stat-cell">{entry.svPct || '-'}</td>
                                                </>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Last Updated */}
            {alumni.lastUpdated && (
                <div className="last-updated">
                    <p>Data from Elite Prospects • Last updated: {new Date(alumni.lastUpdated).toLocaleDateString()}</p>
                </div>
            )}
        </div>
    );
}

export default Alumni;
