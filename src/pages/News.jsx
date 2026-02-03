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

  // Filter logic
  const [filter, setFilter] = useState('All');

  const uniqueSources = ['All', ...new Set(articles.map(a => {
    if (a.source.includes('TheSunDevils')) return 'Official';
    if (a.source.includes('CollegeHockeyNews')) return 'CHN';
    if (a.source.includes('USCHO')) return 'USCHO';
    return 'Other';
  }))];

  const getSourceType = (source) => {
    if (source.includes('TheSunDevils')) return 'Official';
    if (source.includes('CollegeHockeyNews')) return 'CHN';
    if (source.includes('USCHO')) return 'USCHO';
    return 'Other';
  };

  const filteredArticles = filter === 'All'
    ? articles
    : articles.filter(a => getSourceType(a.source) === filter);

  // Split into sections
  const heroArticle = filteredArticles[0];
  const featuredArticles = filteredArticles.slice(1, 4);
  const feedArticles = filteredArticles.slice(4);

  if (loading) {
    return <div className="page-container"><p className="loading-message">Loading news...</p></div>;
  }

  if (error) {
    return <div className="page-container"><p className="error-message">{error}</p></div>;
  }

  return (
    <div className="page-container news-page">
      <h1>Hockey News</h1>

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
        <div className="news-magazine-layout">

          {/* Hero Section */}
          {heroArticle && (
            <section className="news-hero fade-in">
              <a href={heroArticle.link} target="_blank" rel="noopener noreferrer" className="hero-card">
                <div className="hero-content">
                  <div className="hero-meta">
                    <span className="source-badge">{heroArticle.source}</span>
                    <span className="date">{heroArticle.date}</span>
                  </div>
                  <h2>{heroArticle.title}</h2>
                  <span className="read-more">Read Full Story →</span>
                </div>
                <div className="hero-bg-pattern"></div>
              </a>
            </section>
          )}

          {/* Featured Row */}
          {featuredArticles.length > 0 && (
            <section className="news-featured fade-in-delay-1">
              {featuredArticles.map((article, idx) => (
                <a key={idx} href={article.link} target="_blank" rel="noopener noreferrer" className="featured-card">
                  <div className="featured-meta">
                    <span className="source-text">{getSourceType(article.source)}</span>
                    <span className="date-text">{article.date}</span>
                  </div>
                  <h3>{article.title}</h3>
                </a>
              ))}
            </section>
          )}

          {/* Compact Feed */}
          {feedArticles.length > 0 && (
            <section className="news-feed fade-in-delay-2">
              <h3 className="feed-header">More Updates</h3>
              <div className="compact-grid">
                {feedArticles.map((article, idx) => (
                  <a key={idx} href={article.link} target="_blank" rel="noopener noreferrer" className="compact-item">
                    <div className="compact-content">
                      <h4>{article.title}</h4>
                      <div className="compact-meta">
                        <span className="source-sm">{getSourceType(article.source)}</span>
                        <span className="date-sm">{article.date}</span>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </section>
          )}

        </div>
      )}
    </div>
  );
}

export default News;

