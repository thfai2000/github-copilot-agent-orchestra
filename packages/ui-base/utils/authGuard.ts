/**
 * Create an auth middleware that redirects unauthenticated users to /login.
 * Pass the list of public pages that don't require auth.
 */
export function createAuthGuard(publicPages: string[]) {
  return (to: { path: string }) => {
    const path = to.path.replace(/\/+$/, '') || '/';
    if (publicPages.includes(path)) return;

    const token = import.meta.server
      ? useCookie('token')
      : useState<string | null>('auth-token');

    if (!token.value) {
      return navigateTo('/login');
    }
  };
}
