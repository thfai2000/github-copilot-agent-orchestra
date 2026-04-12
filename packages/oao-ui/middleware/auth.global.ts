export default defineNuxtRouteMiddleware(
  createAuthGuard(['/login', '/register']),
);
