
import React, { createContext, useState, useContext, useEffect } from 'react';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [auth, setAuth] = useState(() => {
    try {
      const stored = localStorage.getItem('safaaroo_auth');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  // Persist auth state to localStorage on change
  useEffect(() => {
    if (auth) {
      localStorage.setItem('safaaroo_auth', JSON.stringify(auth));
    } else {
      localStorage.removeItem('safaaroo_auth');
    }
  }, [auth]);

  /**
   * Call after successful login/register.
   * @param {{ token: string, user: { user_id, name, mobile, role } }} data
   */
  const login = (data) => {
    setAuth({ token: data.token, user: data.user });
  };

  const logout = () => {
    setAuth(null);
  };

  const value = {
    token: auth?.token || null,
    user: auth?.user || null,
    role: auth?.user?.role || null,
    isAuthenticated: !!auth?.token,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Custom hook for easy consumption
export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};

export default AuthContext;
