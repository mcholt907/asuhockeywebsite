import React from 'react';
import './About.css';

function About() {
  return (
    <div className="about-page">
      <h1>About ASU Men's Hockey</h1>
      
      <section className="mission-section">
        <h2>Our Mission</h2>
        <p>
          This fan-run site is dedicated to providing the most comprehensive coverage 
          of Arizona State University's NCAA Division I men's ice hockey team. 
          We aim to keep fans informed about games, recruits, and team news while 
          fostering a passionate community of Sun Devil supporters.
        </p>
      </section>

      <div className="about-grid">
        <div className="history-card">
          <h3>Program History</h3>
          <ul>
            <li>🏒 Founded: 2015 (NCAA Division I)</li>
            <li>🏟️ Home Arena: Mullett Arena (Tempe, AZ)</li>
            <li>🎓 Conference: Independent (2023-2024)</li>
            <li>🔥 Rivalries: University of Arizona (Battle for the Desert)</li>
          </ul>
        </div>

        <div className="disclaimer-card">
          <h3>Disclaimer</h3>
          <p>
            This site is not officially affiliated with Arizona State University 
            or its athletics department. All data is sourced from publicly available 
            information and may contain unofficial analysis.
          </p>
        </div>
      </div>

      <section className="contributors">
        <h2>Meet the Team</h2>
        <div className="contributor-profiles">
          <div className="contributor">
            <img src="/assets/contributors/john-doe.jpg" alt="John Doe" />
            <h4>John Doe</h4>
            <p>Lead Writer & Analyst</p>
          </div>
          <div className="contributor">
            <img src="/assets/contributors/jane-smith.jpg" alt="Jane Smith" />
            <h4>Jane Smith</h4>
            <p>Recruiting Expert</p>
          </div>
        </div>
      </section>
    </div>
  );
}

export default About;
