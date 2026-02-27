// App.jsx
import { useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import './App.css';

// Page Components
import Home from './pages/Home';
import News from './pages/News';
import Roster from './pages/Roster';
import Schedule from './pages/Schedule';
import Recruiting from './pages/Recruiting';
import Stats from './pages/Stats';
import About from './pages/About';
import Contact from './pages/Contact';
import Alumni from './pages/Alumni';

// Global Components
import GlobalNotificationBanner from './components/GlobalNotificationBanner';
import MobileBottomNav from './components/MobileBottomNav';

function AppInner() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  const toggleMenu = () => setMenuOpen(!menuOpen);
  const closeMenu = () => setMenuOpen(false);

  const isHome = location.pathname === '/';

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebSite",
            "name": "Forks Up Pucks",
            "alternateName": "ASU Hockey Fan Site",
            "url": "https://forksuppucks.com",
            "description": "The ultimate fan site for ASU Sun Devils Men's Hockey. Live scores, schedule, roster, stats, recruiting news and more."
          })
        }}
      />
      <div className={`app ${menuOpen ? 'menu-open' : ''}`}>
        <header>
          <div className="header-container">
            <div className="logo">
              <img src="/assets/asu-hockey-logo.png" alt="ASU Hockey" width="253" height="500" />
            </div>

            <button className="mobile-menu-btn" onClick={toggleMenu} aria-label="Toggle Menu">
              <span className="hamburger-box">
                <span className="hamburger-inner"></span>
              </span>
            </button>

            <nav className={`main-nav ${menuOpen ? 'open' : ''}`}>
              <div className="nav-overlay-bg"></div>
              <ul>
                <li style={{ '--i': 1 }}><NavLink to="/" onClick={closeMenu}>Home</NavLink></li>
                <li style={{ '--i': 2 }}><NavLink to="/news" onClick={closeMenu}>News</NavLink></li>
                <li style={{ '--i': 3 }}><NavLink to="/schedule" onClick={closeMenu}>Schedule</NavLink></li>
                <li style={{ '--i': 4 }}><NavLink to="/roster" onClick={closeMenu}>Roster</NavLink></li>
                <li style={{ '--i': 5 }}><NavLink to="/stats" onClick={closeMenu}>Stats</NavLink></li>
                <li style={{ '--i': 6 }}><NavLink to="/recruiting" onClick={closeMenu}>Recruiting</NavLink></li>
                <li style={{ '--i': 7 }}><NavLink to="/alumni" onClick={closeMenu}>Where Are They Now?</NavLink></li>
                {/* Hidden for now
                <li style={{ '--i': 8 }}><NavLink to="/about" onClick={closeMenu}>About</NavLink></li>
                <li style={{ '--i': 9 }}><NavLink to="/contact" onClick={closeMenu}>Contact</NavLink></li>
                */}
              </ul>
            </nav>
          </div>
        </header>

        <main>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/news" element={<News />} />
            <Route path="/roster" element={<Roster />} />
            <Route path="/schedule" element={<Schedule />} />
            <Route path="/recruiting" element={<Recruiting />} />
            <Route path="/alumni" element={<Alumni />} />
            <Route path="/stats" element={<Stats />} />
            {/* Hidden for now
            <Route path="/about" element={<About />} />
            <Route path="/contact" element={<Contact />} />
            */}
          </Routes>
        </main>

        {!isHome && <footer>
          <div className="footer-container">
            <div className="footer-logo">
              <img src="/assets/asu-hockey-logo-small.png" alt="ASU Hockey" width="108" height="108" />
            </div>
            <div className="footer-links">
              <h3>Quick Links</h3>
              <nav className="footer-nav">
                <ul>
                  <li><NavLink to="/">Home</NavLink></li>
                  <li><NavLink to="/news">News</NavLink></li>
                  <li><NavLink to="/schedule">Schedule</NavLink></li>
                  <li><NavLink to="/roster">Roster</NavLink></li>
                  <li><NavLink to="/stats">Stats</NavLink></li>
                  <li><NavLink to="/recruiting">Recruiting</NavLink></li>
                  <li><NavLink to="/alumni">Where Are They Now?</NavLink></li>
                </ul>
              </nav>
            </div>
            <div className="footer-social">
              <h3>Follow</h3>
              <div className="social-icons">
                <a href="https://twitter.com/SunDevilHockey" target="_blank" rel="noopener noreferrer"><i className="fa fa-twitter"></i></a>
                <a href="https://www.instagram.com/sundevilhockey/" target="_blank" rel="noopener noreferrer"><i className="fa fa-instagram"></i></a>
                <a href="https://www.facebook.com/SunDevilHockey/" target="_blank" rel="noopener noreferrer"><i className="fa fa-facebook"></i></a>
              </div>
            </div>
          </div>
          <div className="copyright">
            <p>© {new Date().getFullYear()} ASU Hockey Fan Site.</p>
          </div>
        </footer>}

        <GlobalNotificationBanner />
        <MobileBottomNav />
      </div>
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppInner />
    </BrowserRouter>
  );
}

export default App;
