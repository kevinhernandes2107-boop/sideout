import Constants from 'expo-constants';

function resolveHost(): string {
  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants as any).expoGoConfig?.debuggerHost ??
    null;

  if (hostUri) {
    const host = hostUri.split(':')[0];
    if (host) return host;
  }

  return 'localhost';
}

// Production/preview builds bake in a real hosted API URL at build time (see eas.json).
// Local dev (Expo Go / dev client) has no EXPO_PUBLIC_API_URL set, so it falls back to
// auto-detecting the dev server's LAN IP, same as before.
export const API_URL = process.env.EXPO_PUBLIC_API_URL || `http://${resolveHost()}:8000`;

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch<T = any>(
  path: string,
  options: { method?: string; body?: unknown; token?: string | null } = {}
): Promise<T> {
  const { method = 'GET', body, token } = options;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await response.json() : null;

  if (!response.ok) {
    throw new ApiError(response.status, data?.detail || 'Something went wrong.');
  }

  return data as T;
}
