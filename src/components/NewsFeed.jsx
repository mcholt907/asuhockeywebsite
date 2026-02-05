// NewsFeed.jsx
import { useState, useEffect } from 'react';
import { getNews } from '../services/api'; // Import getNews
import { useNotification } from '../context/NotificationContext'; // Import useNotification
import './NewsFeed.css';

function NewsFeed({ limit = 0 }) { // Added limit prop, default to 0 (no limit unless specified)
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeSource, setActiveSource] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const { showNotification } = useNotification(); // Get showNotification function

  useEffect(() => {
    async function fetchNewsData() {
      let notificationShown = false; // Ensure only one notification per fetch attempt
      try {
        setLoading(true);
        setError(null);
        const responseData = await getNews();

        if (responseData.source === 'error') {
          setError(responseData.error || 'Failed to load news.');
          setArticles([]);
          showNotification(responseData.error || 'Failed to load news.', 'error');
          notificationShown = true;
        } else if (responseData.data && Array.isArray(responseData.data)) {
          setArticles(responseData.data);
          if (responseData.source === 'cache') {
            showNotification('News data may not be current.', 'cache', responseData.timestamp);
            notificationShown = true;
          }
        } else {
          setError('News data received in an unexpected format.');
          setArticles([]);
          showNotification('News data format error.', 'error');
          notificationShown = true;
        }
      } catch (err) {
        console.error('Error in NewsFeed fetchNewsData:', err);
        setError('An unexpected error occurred while fetching news.');
        setArticles([]);
        if (!notificationShown) {
          showNotification('Error fetching news.', 'error');
        }
      } finally {
        setLoading(false);
      }
    }

    fetchNewsData();

    // Optional: Set up a refresh interval
    const interval = setInterval(fetchNewsData, 30 * 60 * 1000); // Refresh every 30 minutes

    return () => clearInterval(interval);
  }, [showNotification]);

  // Filter articles based on selected source and search term
  const filteredArticles = articles.filter(article => {
    // Filter by source - use includes() for flexible matching
    const articleSource = (article.source || '').toLowerCase();
    const sourceMatch = activeSource === 'all' ||
      (activeSource === 'official' && articleSource.includes('thesundevils')) ||
      (activeSource === 'uscho' && articleSource.includes('uscho')) ||
      (activeSource === 'chn' && articleSource.includes('collegehockeynews'));

    const searchContent = `${article.title || ''} ${article.summary || ''} ${article.source || ''}`.toLowerCase();
    const searchMatch = !searchTerm || searchContent.includes(searchTerm.toLowerCase());

    return sourceMatch && searchMatch;
  });

  const displayArticles = limit > 0 ? filteredArticles.slice(0, limit) : filteredArticles;

  // Update sources based on what actual scrapers provide
  const sources = [
    { id: 'all', name: 'All Sources' },
    { id: 'official', name: 'TheSunDevils.com' },
    { id: 'chn', name: 'CollegeHockeyNews' },
  ];

  return (
    <div className="news-feed-container">
      <div className="news-feed-header">
        {/* <h2>ASU Hockey News</h2> Removed, as Home.jsx has a section title */}
        <div className="news-controls-static">
          <div className="source-filter">
            {sources.map(source => (
              <button
                key={source.id}
                className={activeSource === source.id ? 'active' : ''}
                onClick={() => setActiveSource(source.id)}
              >
                {source.name}
              </button>
            ))}
          </div>

          <div className="search-box">
            <input
              type="text"
              placeholder="Search news..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="news-items">
        {loading && <p className="loading-message">Loading news...</p>}
        {!loading && error && <p className="error-message">{error}</p>}
        {!loading && !error && displayArticles.length === 0 && (
          <p className="no-news">No news articles found matching your criteria.</p>
        )}
        {!loading && !error && displayArticles.map(article => (
          <div key={article.link || article.title} className="news-feed-item">
            {/* article.thumbnail not currently in scraped data */}
            {/* {article.thumbnail && (
                <div className="news-thumbnail">
                  <img src={article.thumbnail} alt={article.title} />
                </div>
              )} */}

            <div className="news-content">
              <h3 className="news-title">
                <a href={article.link} target="_blank" rel="noopener noreferrer">
                  {article.title}
                </a>
              </h3>

              <div className="news-item-meta">
                <span className="news-source">{article.source}</span>
                {article.date && article.date !== 'Date not found' && (
                  <span className="news-date">{article.date}</span> /* Using string date from scraper for now */
                )}
              </div>

              {/* article.summary not currently in scraped data */}
              {/* {article.summary && (
                  <p className="news-summary">{article.summary}</p>
                )} */}
            </div>
          </div>
        ))
        }
      </div>
    </div>
  );
}

export default NewsFeed;
