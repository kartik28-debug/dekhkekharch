/**
 * AuthContext.jsx — Global authentication state provider.
 *
 * Provides:
 *   - user          : { roll_number, name, must_change_password } | null
 *   - loading       : boolean (true while /me is being checked)
 *   - loginUser()   : call after a successful login API response
 *   - logoutUser()  : clear token and reset state
 *   - refreshUser() : re-fetch /me (e.g. after password change)
 *
 * Protected routes read `user` and `loading` from this context.
 */

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { clearToken, getMe, logout } from '../api/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true); // true until we've checked token

  // On mount: check whether a stored token is still valid
  useEffect(() => {
    let cancelled = false;
    getMe().then(data => {
      if (!cancelled) {
        setUser(data ?? null);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  const loginUser = useCallback((data) => {
    // data = the TokenResponse from the login / change-password endpoints
    setUser({
      roll_number: data.roll_number,
      name: data.name,
      must_change_password: data.must_change_password,
    });
  }, []);

  const refreshUser = useCallback(async () => {
    const data = await getMe();
    setUser(data ?? null);
  }, []);

  const logoutUser = useCallback(async () => {
    await logout();
    clearToken();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, loginUser, refreshUser, logoutUser }}>
      {children}
    </AuthContext.Provider>
  );
}

/** Hook — throws if used outside AuthProvider. */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
