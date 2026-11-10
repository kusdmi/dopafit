/** Minimal event bus so the shared API client can signal upper layers without importing them. */
type AuthEvent = 'unauthorized';
type Listener = () => void;

const listeners = new Map<AuthEvent, Set<Listener>>();

export const authEvents = {
  on(event: AuthEvent, listener: Listener): () => void {
    const set = listeners.get(event) ?? new Set<Listener>();
    set.add(listener);
    listeners.set(event, set);
    return () => set.delete(listener);
  },
  emit(event: AuthEvent): void {
    listeners.get(event)?.forEach((listener) => listener());
  },
};

type NetworkEvent = 'reachable' | 'failure';
type NetworkListener = (event: NetworkEvent) => void;
const networkListeners = new Set<NetworkListener>();
export const apiNetworkEvents = {
  on(listener: NetworkListener): () => void {
    networkListeners.add(listener);
    return () => {
      networkListeners.delete(listener);
    };
  },
  emit(event: NetworkEvent = 'failure'): void {
    for (const listener of networkListeners) {
      try {
        listener(event);
      } catch {
        /* Connectivity observers cannot fail API requests. */
      }
    }
  },
};
