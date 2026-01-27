// RecruitingTable.jsx (updated)
import React, { useState, useEffect } from 'react';
import DataStatusBanner from '../components/DataStatusBanner';
import ManualRecruitingEntry from './ManualRecruitingEntry';
// ... other imports

function RecruitingTable() {
  const [data, setData] = useState([]);
  const [manualEntries, setManualEntries] = useState([]);
  const [dataSource, setDataSource] = useState(null);
  const [timestamp, setTimestamp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showManualEntry, setShowManualEntry] = useState(false);

  useEffect(() => {
    fetchData();
    
    // Load manual entries from localStorage
    const storedEntries = localStorage.getItem('manualRecruitingEntries');
    if (storedEntries) {
      setManualEntries(JSON.parse(storedEntries));
    }
  }, []);
  
  // Save manual entries whenever they change
  useEffect(() => {
    localStorage.setItem('manualRecruitingEntries', JSON.stringify(manualEntries));
  }, [manualEntries]);

  async function fetchData() {
    try {
      setLoading(true);
      const response = await fetch('/api/recruiting-data');
      const result = await response.json();
      
      setData(result.data);
      setDataSource(result.source);
      setTimestamp(result.timestamp);
      setError(null);
      
      // Only show manual entry form when using cached data or on error
      setShowManualEntry(result.source !== 'live');
    } catch (err) {
      setError('Failed to load data');
      setDataSource('error');
      setShowManualEntry(true);
    } finally {
      setLoading(false);
    }
  }
  
  const handleAddManualEntry = (entry) => {
    setManualEntries([entry, ...manualEntries]);
  };
  
  const handleRemoveManualEntry = (index) => {
    setManualEntries(manualEntries.filter((_, i) => i !== index));
  };
  
  // Combine API data with manual entries
  const combinedData = [
    ...manualEntries.map(entry => ({...entry, source: 'manual'})),
    ...data
  ];

  return (
    <div className="recruiting-container">
      <h2>ASU Hockey Recruiting Updates</h2>
      
      <DataStatusBanner dataSource={dataSource} timestamp={timestamp} />
      
      {loading ? (
        <div className="loading">Loading...</div>
      ) : (
        <>
          {showManualEntry && (
            <ManualRecruitingEntry onAdd={handleAddManualEntry} />
          )}
          
          <table className="recruiting-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Player</th>
                <th>Position</th>
                <th>Status</th>
                <th>From/To</th>
                {manualEntries.length > 0 && <th>Source</th>}
                {manualEntries.length > 0 && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {combinedData.length === 0 ? (
                <tr>
                  <td colSpan={manualEntries.length > 0 ? 7 : 5}>
                    No recruiting data available
                  </td>
                </tr>
              ) : (
                combinedData.map((item, index) => (
                  <tr key={index} className={item.source === 'manual' ? 'manual-row' : ''}>
                    <td>{item.date}</td>
                    <td>{item.player}</td>
                    <td>{item.position}</td>
                    <td>{item.status}</td>
                    <td>{item.team}</td>
                    {manualEntries.length > 0 && (
                      <td>{item.source === 'manual' ? 'Manually Added' : 'Elite Prospects'}</td>
                    )}
                    {manualEntries.length > 0 && (
                      <td>
                        {item.source === 'manual' && (
                          <button 
                            className="remove-btn" 
                            onClick={() => handleRemoveManualEntry(manualEntries.findIndex(e => e === item))}
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
