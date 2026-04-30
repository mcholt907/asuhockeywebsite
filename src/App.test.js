import React from 'react';
import { render, screen } from '@testing-library/react';
import { NotificationProvider } from './context/NotificationContext';
import { __setMockPathname } from 'react-router-dom';

// Use manual mock from __mocks__ directory
jest.mock('react-router-dom');

import App from './App';

// Helper to render App with all providers
// Note: App.js already includes BrowserRouter, so we don't need to wrap it again
const renderApp = () => {
  return render(
    <NotificationProvider>
      <App />
    </NotificationProvider>
  );
};

describe('App Component', () => {
  beforeEach(() => {
    __setMockPathname('/');
  });

  it('should render the header with logo', () => {
    renderApp();
    // There are multiple logos (header and footer), so get all and check first one
    const logos = screen.getAllByAltText('ASU Hockey');
    expect(logos.length).toBeGreaterThan(0);
    expect(logos[0]).toBeInTheDocument();
  });

  it('should render navigation links', () => {
    renderApp();

    const homeLinks = screen.getAllByText('Home');
    const newsLinks = screen.getAllByText('News');
    const rosterLinks = screen.getAllByText('Roster');
    const scheduleLinks = screen.getAllByText('Schedule');
    const recruitingLinks = screen.getAllByText('Recruiting');
    const statsLinks = screen.getAllByText('Stats');
    const alumniLinks = screen.getAllByText(/Where Are They Now\?|Alumni/);
    
    expect(homeLinks.length).toBeGreaterThan(0);
    expect(newsLinks.length).toBeGreaterThan(0);
    expect(rosterLinks.length).toBeGreaterThan(0);
    expect(scheduleLinks.length).toBeGreaterThan(0);
    expect(recruitingLinks.length).toBeGreaterThan(0);
    expect(statsLinks.length).toBeGreaterThan(0);
    expect(alumniLinks.length).toBeGreaterThan(0);
  });

  it('should render footer with copyright', () => {
    __setMockPathname('/news');
    renderApp();
    const currentYear = new Date().getFullYear();
    expect(screen.getByText(new RegExp(`© ${currentYear} ASU Hockey Fan Site`))).toBeInTheDocument();
  });

  it('should render social media links in footer', () => {
    __setMockPathname('/news');
    renderApp();
    // Social media links don't have accessible text (just icons), so query by href
    const allLinks = screen.getAllByRole('link');
    const twitter = allLinks.find(link => link.getAttribute('href') === 'https://twitter.com/SunDevilHockey');
    const instagram = allLinks.find(link => link.getAttribute('href') === 'https://www.instagram.com/sundevilhockey/');
    const facebook = allLinks.find(link => link.getAttribute('href') === 'https://www.facebook.com/SunDevilHockey/');
    
    expect(twitter).toBeDefined();
    expect(instagram).toBeDefined();
    expect(facebook).toBeDefined();
  });
});
