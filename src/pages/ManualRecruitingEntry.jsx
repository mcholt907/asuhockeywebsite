// ManualRecruitingEntry.jsx
import React, { useState } from 'react';

function ManualRecruitingEntry({ onAdd }) {
  const [player, setPlayer] = useState('');
  const [position, setPosition] = useState('');
  const [status, setStatus] = useState('Joining');
  const [team, setTeam] = useState('');
  
  const handleSubmit = (e) => {
    e.preventDefault();
    
    onAdd({
      player,
      position,
      status,
      team,
      date: new Date().toISOString().split('T')[0],
      manual: true
    });
    
    // Reset form
    setPlayer('');
    setPosition('');
    setStatus('Joining');
    setTeam('');
  };
  
  return (
    <div className="manual-entry">
      <h3>Manually Add Recruiting Info</h3>
      <p className="manual-entry-info">
        Can't see the latest recruiting updates? Add them manually below.
        <br />
        <small>Note: Manually added entries are stored in your browser and not shared with other users.</small>
      </p>
      
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="player">Player Name:</label>
          <input 
            type="text" 
            id="player" 
            value={player} 
            onChange={(e) => setPlayer(e.target.value)}
            required 
          />
        </div>
        
        <div className="form-group">
          <label htmlFor="position">Position:</label>
          <select 
            id="position" 
            value={position} 
            onChange={(e) => setPosition(e.target.value)}
            required
          >
            <option value="">Select Position</option>
            <option value="F">Forward (F)</option>
            <option value="D">Defenseman (D)</option>
            <option value="G">Goaltender (G)</option>
          </select>
        </div>
        
        <div className="form-group">
          <label htmlFor="status">Status:</label>
          <select 
            id="status" 
            value={status} 
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="Joining">Joining</option>
            <option value="Leaving">Leaving</option>
            <option value="Committed">Committed</option>
          </select>
        </div>
        
        <div className="form-group">
          <label htmlFor="team">From/To Team:</label>
          <input 
            type="text" 
            id="team" 
            value={team} 
            onChange={(e) => setTeam(e.target.value)}
            required 
          />
        </div>
        
        <button type="submit" className="submit-btn">Add Entry</button>
      </form>
    </div>
  );
}

export default ManualRecruitingEntry;
