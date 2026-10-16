import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

const ACCESS_KEY = 'alkhal.accessToken';
const REFRESH_KEY = 'alkhal.refreshToken';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public messageAr: string,
    public messageEn: string,
  ) {
    super(messageAr);
  }
}

function defaultApiUrl() {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL.replace(/\/$/, '');
  }
  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants as { expoGoConfig?: { debuggerHost?: string } }).expoGoConfig?.debuggerHost ??
    '';
  const host = hostUri.split(':')[0];
  if (host && host !== 'localhost' && host !== '127.0.0.1') {
    return `http://${host}:4000/api`;
  }
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:4000/api';
  }
  return 'http://localhost:4000/api';
}

export const API_URL = defaultApiUrl();

async function memoryGet(key: string) {
  if (Platform.OS === 'web') {
    return globalThis.localStorage?.getItem(key) ?? null;
  }
  return SecureStore.getItemAsync(key);
}

async function memorySet(key: string, value: string) {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function memoryDel(key: string) {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export async function getAccessToken() {
  return memoryGet(ACCESS_KEY);
}

export async function getRefreshToken() {
  return memoryGet(REFRESH_KEY);
}

export async function setTokens(accessToken: string, refreshToken: string) {
  await memorySet(ACCESS_KEY, accessToken);
  await memorySet(REFRESH_KEY, refreshToken);
}

export async function clearTokens() {
  await memoryDel(ACCESS_KEY);
  await memoryDel(REFRESH_KEY);
}

async function parseError(res: Response): Promise<never> {
  const body = await res.json().catch(() => ({}));
  throw new ApiError(
    res.status,
    body.error ?? 'ERROR',
    body.message ?? 'حدث خطأ',
    body.messageEn ?? 'Error',
  );
}

async function refreshAccess() {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) {
    return false;
  }
  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) {
    await clearTokens();
    return false;
  }
  const data = (await res.json()) as { accessToken: string; refreshToken: string };
  await setTokens(data.accessToken, data.refreshToken);
  return true;
}

export async function api<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (res.status === 401 && retry && !path.startsWith('/auth/login')) {
    const ok = await refreshAccess();
    if (ok) {
      return api<T>(path, init, false);
    }
  }
  if (!res.ok) {
    await parseError(res);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}
