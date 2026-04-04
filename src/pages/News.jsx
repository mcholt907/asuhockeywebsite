import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { getNews } from '../services/api';
import './News.css';

function News() {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchArticles = async () => {
      try {
        setLoading(true);
        setError(null);
        const responseData = await getNews();

        if (responseData.source === 'error') {
          setError(responseData.error || 'Failed to load news articles.');
          setArticles([]);
        } else if (responseData.data && Array.isArray(responseData.data)) {
          setArticles(responseData.data);
        } else {
          setError('Could not load news articles in the expected format.');
          setArticles([]);
        }
      } catch (err) {
        setError('Failed to load news articles. Please try again later.');
        setArticles([]);
      } finally {
        setLoading(false);
      }
    };

    fetchArticles();
  }, []);

  const [filter, setFilter] = useState('All');

  const getSourceType = (source) => {
    if (source.includes('TheSunDevils')) return 'Official';
    if (source.includes('CollegeHockeyNews')) return 'CHN';
    if (source.includes('USCHO')) return 'USCHO';
    return source; // show actual source name for manual/other articles
  };

  const filteredArticles = filter === 'All'
    ? articles
    : articles.filter(a => getSourceType(a.source) === filter);

  const heroArticle    = filteredArticles[0];
  const wideCard       = filteredArticles[1];
  const stackedCards   = filteredArticles.slice(2, 4);
  const gridCards      = filteredArticles.slice(4, 7);
  const listArticles   = filteredArticles.slice(7);

  if (loading) {
    return <div className="news-page"><div className="news-content"><p className="loading-message">Loading news...</p></div></div>;
  }

  if (error) {
    return <div className="news-page"><div className="news-content"><p className="error-message">{error}</p></div></div>;
  }

  return (
    <div className="news-page">
      <Helmet>
        <title>ASU Hockey News & Updates | Forks Up Pucks</title>
        <meta name="description" content="Get the latest ASU hockey news, insights, and recaps. All the headlines for ASU Sun Devils Men's Ice Hockey in one place." />
        <meta property="og:title" content="ASU Hockey News & Updates | Forks Up Pucks" />
        <meta property="og:description" content="Get the latest ASU hockey news, insights, and recaps. All the headlines for ASU Sun Devils Men's Ice Hockey in one place." />
        <meta property="og:url" content="https://forksuppucks.com/news" />
        <meta name="twitter:title" content="ASU Hockey News & Updates | Forks Up Pucks" />
        <meta name="twitter:description" content="Get the latest ASU hockey news, insights, and recaps. All the headlines for ASU Sun Devils Men's Ice Hockey in one place." />
        <link rel="canonical" href="https://forksuppucks.com/news" />
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            "itemListElement": [
              { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://forksuppucks.com" },
              { "@type": "ListItem", "position": 2, "name": "News", "item": "https://forksuppucks.com/news" }
            ]
          })}
        </script>
      </Helmet>
      <div className="news-content">

        {/* Page Header */}
        <div className="news-header">
          <p className="news-header-eyebrow">ASU Hockey</p>
          <h1 className="news-header-title">ASU Hockey News</h1>
          <div className="news-header-rule" />
        </div>

        {/* Filters */}
        <div className="news-filters">
          {['All', 'Official', 'CHN'].map(f => (
            <button
              key={f}
              className={`filter-btn ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'All' ? 'All News' : f}
            </button>
          ))}
        </div>

        {filteredArticles.length === 0 ? (
          <p className="no-news-message">No news articles found for this category.</p>
        ) : (
          <div className="news-layout">

            {/* Featured Story */}
            {heroArticle && (
              <section className="news-hero fade-in">
                <a href={heroArticle.link} target="_blank" rel="noopener noreferrer" className="hero-card">
                  <div className="hero-content">
                    <span className="hero-eyebrow">Featured Story</span>
                    <h2>{heroArticle.title}</h2>
                    <div className="hero-footer">
                      <span className="hero-source">{getSourceType(heroArticle.source)}</span>
                      <span className="meta-sep">·</span>
                      <span className="hero-date">{heroArticle.date}</span>
                      <span className="read-more">Read Full Story →</span>
                    </div>
                  </div>
                </a>
              </section>
            )}

            {/* Magazine Row — wide card + 2 stacked cards */}
            {wideCard && (
              <section className="articles-section fade-in-delay-1">

                {/* Asymmetric magazine row */}
                <div className="magazine-row">
                  <a href={wideCard.link} target="_blank" rel="noopener noreferrer" className="news-card news-card-wide" style={{ backgroundImage: `linear-gradient(to bottom, rgba(15,1,5,0.42) 0%, rgba(15,1,5,0.10) 25%, rgba(15,1,5,0.10) 65%, rgba(15,1,5,0.82) 100%), url(${process.env.PUBLIC_URL}/images/Ice-hockey-hero.webp)` }}>
                    <span className="news-card-source">{getSourceType(wideCard.source)}</span>
                    <h3 className="news-card-title news-card-title-wide">{wideCard.title}</h3>
                    <span className="news-card-date">{wideCard.date}</span>
                  </a>
                  {stackedCards.length > 0 && (
                    <div className="stacked-cards">
                      {stackedCards.map((article) => (
                        <a key={article.link} href={article.link} target="_blank" rel="noopener noreferrer" className="news-card news-card-compact">
                          <span className="news-card-source">{getSourceType(article.source)}</span>
                          <h3 className="news-card-title">{article.title}</h3>
                          <span className="news-card-date">{article.date}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>

                {/* 3-column compact grid */}
                {gridCards.length > 0 && (
                  <div className="compact-grid">
                    {gridCards.map((article) => (
                      <a key={article.link} href={article.link} target="_blank" rel="noopener noreferrer" className="news-card news-card-compact">
                        <span className="news-card-source">{getSourceType(article.source)}</span>
                        <h3 className="news-card-title">{article.title}</h3>
                        <span className="news-card-date">{article.date}</span>
                      </a>
                    ))}
                  </div>
                )}

              </section>
            )}

            {/* Older Stories — separate container so maroon background shows between sections */}
            {listArticles.length > 0 && (
              <section className="older-stories-section fade-in-delay-1">
                <div className="headlines-header">
                  <h2 className="headlines-title">Older Stories</h2>
                </div>
                <div className="articles-feed">
                  {listArticles.map((article) => (
                    <a key={article.link} href={article.link} target="_blank" rel="noopener noreferrer" className="feed-item">
                      <span className="feed-date">{article.date}</span>
                      <span className="feed-divider" aria-hidden="true" />
                      <span className="feed-title">{article.title}</span>
                      <span className="feed-source">{getSourceType(article.source)}</span>
                    </a>
                  ))}
                </div>
              </section>
            )}

          </div>
        )}
      </div>
    </div>
  );
}

export default News;
