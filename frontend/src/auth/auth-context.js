import { createContext, useContext } from 'react';

export const AuthContext = createContext(null);

export const ME_QUERY_KEY = ['auth', 'me'];

/** { user, isLoading, can(permission), hasRole(...codes), login, logout } */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
