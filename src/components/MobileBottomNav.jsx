// src/components/MobileBottomNav.jsx
import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import './MobileBottomNav.css';

// Simple SVG icons matching mockup style
const icons = {
    home: (
        <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
        </svg>
    ),
    news: (
        <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" />
        </svg>
    ),
    schedule: (
        <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zM9 14H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2zm-8 4H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2z" />
        </svg>
    ),
    roster: (
        <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
        </svg>
    ),
    stats: (
        <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" />
        </svg>
    ),
    recruiting: (
        <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
        </svg>
    ),
    alumni: (
        <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3L1 9l11 6 9-4.91V17h2V9L12 3z" />
        </svg>
    ),
};

const navItems = [
    { path: '/', label: 'Home', icon: icons.home },
    { path: '/news', label: 'News', icon: icons.news },
    { path: '/schedule', label: 'Schedule', icon: icons.schedule },
    { path: '/roster', label: 'Roster', icon: icons.roster },
    { path: '/stats', label: 'Stats', icon: icons.stats },
    { path: '/recruiting', label: 'Recruiting', icon: icons.recruiting },
    { path: '/alumni', label: 'Alumni', icon: icons.alumni },
];

function MobileBottomNav() {
    const location = useLocation();
    const [showScrollHint, setShowScrollHint] = React.useState(true);
    const scrollRef = React.useRef(null);

    const handleScroll = (e) => {
        const { scrollLeft, scrollWidth, clientWidth } = e.target;
        // Hide hint once user scrolls even a little
        if (scrollLeft > 10) {
            setShowScrollHint(false);
        }
        // Show hint again if scrolled back to start and there's more content
        if (scrollLeft === 0 && scrollWidth > clientWidth) {
            setShowScrollHint(true);
        }
    };

    return (
        <nav className="mobile-bottom-nav">
            <div
                className="bottom-nav-scroll"
                ref={scrollRef}
                onScroll={handleScroll}
            >
                {navItems.map((item) => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        className={`bottom-nav-item ${location.pathname === item.path ? 'active' : ''}`}
                    >
                        <span className="nav-icon">{item.icon}</span>
                        <span className="nav-label">{item.label}</span>
                    </NavLink>
                ))}
            </div>
            {showScrollHint && (
                <div className="scroll-hint">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z" />
                    </svg>
                </div>
            )}
        </nav>
    );
}

export default MobileBottomNav;
