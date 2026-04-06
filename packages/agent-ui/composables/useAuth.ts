/**
 * Agent UI auth — delegates to shared useAuthCore from ui-base layer.
 */
export function useAuth() {
  return useAuthCore();
}
