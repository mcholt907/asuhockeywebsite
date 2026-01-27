import React from 'react';
import { useNotification } from '../context/NotificationContext';
import './GlobalNotificationBanner.css'; // We will create this CSS file

function GlobalNotificationBanner() {
  const { notification, hideNotification } = useNotification();

  if (!notification) {
    return null;
  }

  const { message, type, timestamp } = notification;
  let bannerTypeClass = 'info';
  let iconPath = 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z'; // Default info/warning icon

  if (type === 'error') {
    bannerTypeClass = 'error';
    // You can use a different icon for errors if desired
  } else if (type === 'cache') {
    bannerTypeClass = 'warning'; // Using warning style for cache
  }

  let displayMessage = message;
  if (type === 'cache' && timestamp) {
    const formattedTime = new Date(timestamp).toLocaleString();
    displayMessage = `Using cached data (last updated: ${formattedTime}). ${message}`;
  } else if (type === 'cache') {
    displayMessage = `Using cached data (update time unknown). ${message}`;
  }


  return (
    <div className={`global-notification-banner ${bannerTypeClass}`}>
      <svg className="banner-icon" viewBox="0 0 24 24">
        <path d={iconPath} />
      </svg>
      <span className="banner-message">{displayMessage}</span>
      <button onClick={hideNotification} className="close-banner-button">
        &times;
      </button>
    </div>
  );
}

export default GlobalNotificationBanner; 