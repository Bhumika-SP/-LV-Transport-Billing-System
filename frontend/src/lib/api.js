import axios from 'axios';

/**
 * Shared API client. Auth uses HTTP-only cookies, so `withCredentials` is required
 * and no token is ever stored in JavaScript-accessible storage.
 */
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  withCredentials: true,
  timeout: 30_000,
});

/** Turn any axios error into the backend's { message, code } shape for display. */
export function toApiError(error) {
  const body = error?.response?.data;
  return {
    status: error?.response?.status ?? 0,
    message:
      body?.message ||
      (error?.code === 'ERR_NETWORK' ? 'Cannot reach the server' : 'Something went wrong'),
    code: body?.code || 'UNKNOWN_ERROR',
    details: body?.details,
  };
}

/** Health lives outside /api, so it uses a plain request. */
export async function fetchHealth() {
  const res = await axios.get('/health', { validateStatus: () => true });
  return res.data;
}
