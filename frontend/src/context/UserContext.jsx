
import React, { createContext, useState, useEffect } from 'react';

export const UserContext = createContext();

export const UserProvider = ({ children }) => {
  const [deviceInfo, setDeviceInfo] = useState(() => {
    // Retrieve stored user session from localStorage if present
    const saved = localStorage.getItem('safar_tracker_device');
    return saved ? JSON.parse(saved) : null;
  });

  // Save session state to localStorage whenever it changes
  useEffect(() => {
    if (deviceInfo) {
      localStorage.setItem('safar_tracker_device', JSON.stringify(deviceInfo));
    } else {
      localStorage.removeItem('safar_tracker_device');
    }
  }, [deviceInfo]);

  const logout = () => {
    setDeviceInfo(null);
  };

  return (
    <UserContext.Provider value={{ deviceInfo, setDeviceInfo, logout }}>
      {children}
    </UserContext.Provider>
  );
};