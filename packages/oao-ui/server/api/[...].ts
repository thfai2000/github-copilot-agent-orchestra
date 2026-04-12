import { proxyRequest } from 'h3';

export default defineEventHandler(async (event) => {
  // All API requests go to OAO-API (including auth — OAO owns its own identity)
  const apiBase = process.env.NUXT_API_BASE_URL || 'http://localhost:4002';
  return proxyRequest(event, apiBase + event.path);
});
