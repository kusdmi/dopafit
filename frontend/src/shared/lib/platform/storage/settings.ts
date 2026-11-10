/**
 * Platform storage adapter. The only place allowed to touch localStorage —
 * swapped for AsyncStorage and the like when React Native arrives.
 */
export const platformStorage = {
  get(key: string): string | null {
    return window.localStorage.getItem(key);
  },
  set(key: string, value: string): void {
    window.localStorage.setItem(key, value);
  },
  remove(key: string): void {
    window.localStorage.removeItem(key);
  },
};
