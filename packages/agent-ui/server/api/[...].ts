import { proxyRequest } from 'h3';

export default defineEventHandler(async (event) => {
  // All API requests go to Agent API (including auth — Agent Platform owns its own identity)
  const apiBase = process.env.NUXT_API_BASE_URL || 'http://localhost:4002';
  return proxyRequest(event, apiBase + event.path);
});
