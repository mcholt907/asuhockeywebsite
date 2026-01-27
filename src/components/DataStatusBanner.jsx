// DataStatusBanner.jsx
import React from 'react';
import './DataStatusBanner.css';

function DataStatusBanner({ dataSource, timestamp, errorMsg }) {
  if (dataSource === 'live' || dataSource === 'loading') {
    return null; // Don't show banner for live data or loading
  }
  
  let formattedTime = 'N/A';
  if (timestamp) {
    const dateObj = new Date(timestamp);
    if (!isNaN(dateObj.getTime())) {
      formattedTime = dateObj.toLocaleString();
    } else {
      formattedTime = 'Invalid Date';
    }
  } else if (dataSource === 'cache') {
    formattedTime = 'Unknown'; // If cache but no timestamp
  }

  const genericCacheMessage = "Data is from cache and may not be current.";
  const genericErrorMessage = "We're experiencing difficulties connecting to our data sources. Please try again later.";
  
  return (
    <div className={`data-status-banner ${dataSource}`}>
      {dataSource === 'cache' ? (
        <>
          <svg className="warning-icon" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
          </svg>
          <span>
            <strong>Using cached data</strong> (last updated: {formattedTime})
            <br />
            <small>{genericCacheMessage}</small>
          </span>
        </>
      ) : (
        <>
          <svg className="error-icon" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
          </svg>
          <span>
            <strong>{errorMsg ? 'Error Retrieving Data' : 'Unable to retrieve data'}</strong>
            <br />
            <small>{errorMsg || genericErrorMessage}</small>
          </span>
        </>
      )}
    </div>
  );
}

export default DataStatusBanner;
