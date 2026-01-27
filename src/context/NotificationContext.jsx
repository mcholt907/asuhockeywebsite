import React, { createContext, useState, useCallback, useContext } from 'react';

const NotificationContext = createContext(null);

export const NotificationProvider = ({ children }) => {
  const [notification, setNotification] = useState(null); // { message, type, timestamp }

  const showNotification = useCallback((message, type = 'info', timestamp = null) => {
    setNotification({ message, type, timestamp });
    // Optional: auto-hide after a delay
    // setTimeout(() => {
    //   setNotification(null);
    // }, 5000); // Hide after 5 seconds
  }, []);

  const hideNotification = useCallback(() => {
    setNotification(null);
  }, []);

  return (
    <NotificationContext.Provider value={{ notification, showNotification, hideNotification }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
}; 