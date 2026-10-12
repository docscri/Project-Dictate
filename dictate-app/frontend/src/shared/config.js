const env = import.meta.env ?? {};

export const apiBaseUrl = (env.VITE_API_BASE_URL ?? 'http://localhost:8000').replace(/\/+$/, '');
export const pollIntervalMs = 1500;
export const autosaveDelayMs = 1000;
export const requestTimeoutMs = 15000;
export const useMock = env.VITE_USE_MOCK === 'true';
