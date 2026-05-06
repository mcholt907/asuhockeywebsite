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

  it('should render the header with logo', async () => {
    renderApp();
    // findAllBy* awaits — gives lazy route chunks time to resolve, avoiding act warnings.
    const logos = await screen.findAllByAltText('ASU Hockey');
    expect(logos.length).toBeGreaterThan(0);
    expect(logos[0]).toBeInTheDocument();
  });

  it('should render navigation links', async () => {
    renderApp();

    const homeLinks = await screen.findAllByText('Home');
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

  it('should render footer with copyright', async () => {
    __setMockPathname('/news');
    renderApp();
    const currentYear = new Date().getFullYear();
    expect(await screen.findByText(new RegExp(`© ${currentYear} ASU Hockey Fan Site`))).toBeInTheDocument();
  });

  it('should render social media links in footer', async () => {
    __setMockPathname('/news');
    renderApp();
    // Social media links don't have accessible text (just icons), so query by href
    const allLinks = await screen.findAllByRole('link');
    const twitter = allLinks.find(link => link.getAttribute('href') === 'https://twitter.com/SunDevilHockey');
    const instagram = allLinks.find(link => link.getAttribute('href') === 'https://www.instagram.com/sundevilhockey/');
    const facebook = allLinks.find(link => link.getAttribute('href') === 'https://www.facebook.com/SunDevilHockey/');

    expect(twitter).toBeDefined();
    expect(instagram).toBeDefined();
    expect(facebook).toBeDefined();
  });
});
