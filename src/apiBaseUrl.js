const productionApi = 'https://ml-academy-api.arvydasmockus.workers.dev';
const localHosts = new Set(['localhost', '127.0.0.1', '::1']);

const isLocalHost = typeof window !== 'undefined' && localHosts.has(window.location.hostname);
const defaultApi = import.meta.env.DEV || isLocalHost ? '' : productionApi;

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || defaultApi).replace(/\/+$/, '');
