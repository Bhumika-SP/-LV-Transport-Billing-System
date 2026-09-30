import axios from 'axios';

/**
 * Shared API client. Auth uses HTTP-only cookies, so `withCredentials` is required
 * and no token is ever stored in JavaScript-accessible storage.
 * `X-Requested-With` is required by the backend on state-changing requests (CSRF defence).
 */
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  withCredentials: true,
  timeout: 30_000,
  headers: { 'X-Requested-With': 'XMLHttpRequest' },
});

/** Normalize any axios error into the backend's { message, code, details } shape. */
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

// Reject with the normalized error so components can show `error.message` directly.
api.interceptors.response.use(
  (res) => res,
  (error) => Promise.reject(Object.assign(new Error(toApiError(error).message), toApiError(error))),
);

/** Unwrap the { success, data, meta } envelope. */
export async function get(url, params) {
  const res = await api.get(url, { params });
  return res.data.meta ? { items: res.data.data, meta: res.data.meta } : res.data.data;
}

export async function post(url, body) {
  return (await api.post(url, body)).data.data;
}

export async function patch(url, body) {
  return (await api.patch(url, body)).data.data;
}

export async function del(url, body) {
  return (await api.delete(url, { data: body })).data.data;
}

/** Health lives outside /api, so it uses a plain request. */
export async function fetchHealth() {
  const res = await axios.get('/health', { validateStatus: () => true });
  return res.data;
}

/**
 * Apply backend field-level validation errors to a react-hook-form instance.
 * Returns true if at least one field error was applied.
 */
export function applyServerErrors(error, setError) {
  if (error?.code !== 'VALIDATION_ERROR' || !Array.isArray(error.details)) return false;
  let applied = false;
  for (const d of error.details) {
    if (d.path) {
      setError(d.path, { type: 'server', message: d.message });
      applied = true;
    }
  }
  return applied;
}
