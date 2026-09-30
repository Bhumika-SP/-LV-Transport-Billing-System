import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { api, post } from '../lib/api';
import { AuthContext, ME_QUERY_KEY } from './auth-context';

async function fetchMe() {
  try {
    const res = await api.get('/auth/me');
    return res.data.data;
  } catch (err) {
    if (err.status === 401) return null;
    throw err;
  }
}

/**
 * Session state comes from GET /auth/me (the cookie is HTTP-only, so JS never sees
 * the token). Permissions returned by the backend drive what the UI shows; the
 * backend still enforces every permission independently.
 */
export default function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const { data: user, isLoading } = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: fetchMe,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const login = useCallback(
    async (credentials) => {
      const me = await post('/auth/login', credentials);
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== ME_QUERY_KEY[0] });
      queryClient.setQueryData(ME_QUERY_KEY, me);
      return me;
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    try {
      await post('/auth/logout');
    } finally {
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== ME_QUERY_KEY[0] });
      queryClient.setQueryData(ME_QUERY_KEY, null);
    }
  }, [queryClient]);

  const value = useMemo(
    () => ({
      user: user ?? null,
      isLoading,
      can: (permission) => Boolean(user?.permissions?.includes(permission)),
      hasRole: (...codes) => Boolean(user && codes.includes(user.role.code)),
      login,
      logout,
    }),
    [user, isLoading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
