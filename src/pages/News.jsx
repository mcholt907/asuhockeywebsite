import React, { useState, useEffect } from 'react';
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
    return 'Other';
  };

  const filteredArticles = filter === 'All'
    ? articles
    : articles.filter(a => getSourceType(a.source) === filter);

  const heroArticle = filteredArticles[0];
  const remainingArticles = filteredArticles.slice(1);

  if (loading) {
    return <div className="news-page"><div className="news-content"><p className="loading-message">Loading news...</p></div></div>;
  }

  if (error) {
    return <div className="news-page"><div className="news-content"><p className="error-message">{error}</p></div></div>;
  }

  return (
    <div className="news-page">
      <title>News | Forks Up Pucks – ASU Sun Devils Hockey</title>
      <meta name="description" content="Latest news and headlines for ASU Sun Devils Men's Hockey." />
      <meta property="og:title" content="News | Forks Up Pucks – ASU Sun Devils Hockey" />
      <meta property="og:description" content="Latest news and headlines for ASU Sun Devils Men's Hockey." />
      <meta property="og:url" content="https://forksuppucks.com/news" />
      <meta name="twitter:title" content="News | Forks Up Pucks – ASU Sun Devils Hockey" />
      <meta name="twitter:description" content="Latest news and headlines for ASU Sun Devils Men's Hockey." />
    <div className="news-content">

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
                <div className="hero-bg-pattern"></div>
                <div className="hero-content">
                  <span className="hero-eyebrow">FEATURED STORY</span>
                  <h2>{heroArticle.title}</h2>
                  <div className="hero-footer">
                    <span className="hero-source">{getSourceType(heroArticle.source)}</span>
                    <span className="meta-sep">•</span>
                    <span className="hero-date">{heroArticle.date}</span>
                    <span className="read-more">READ FULL STORY →</span>
                  </div>
                </div>
              </a>
            </section>
          )}

          {/* Latest Headlines */}
          {remainingArticles.length > 0 && (
            <section className="articles-section fade-in-delay-1">
              <div className="headlines-header">
                <h2 className="headlines-title">
                  LATEST <span className="headlines-gold">HEADLINES</span>
                </h2>
              </div>
              <div className="articles-grid">
                {remainingArticles.map((article, idx) => (
                  <a key={idx} href={article.link} target="_blank" rel="noopener noreferrer" className="article-card">
                    <div className="article-meta">
                      <span className="article-source">{getSourceType(article.source)}</span>
                      <span className="meta-sep">•</span>
                      <span className="article-date">{article.date}</span>
                    </div>
                    <h3 className="article-title">{article.title}</h3>
                    <span className="article-read">READ STORY →</span>
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
