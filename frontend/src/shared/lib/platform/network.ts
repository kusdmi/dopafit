import type { ConnectionStatus } from '@capacitor/network';
import { env } from '@/shared/config/env';

const webStatus = (): ConnectionStatus => ({
  connected: navigator.onLine,
  connectionType: 'unknown',
});

export const Network = {
  async getStatus(): Promise<ConnectionStatus> {
    if (env.isNative) return (await import('@capacitor/network')).Network.getStatus();
    return webStatus();
  },
  async addListener(_event: 'networkStatusChange', listener: (status: ConnectionStatus) => void) {
    if (env.isNative)
      return (await import('@capacitor/network')).Network.addListener(
        'networkStatusChange',
        listener,
      );
    const online = () => listener({ connected: true, connectionType: 'unknown' });
    const offline = () => listener({ connected: false, connectionType: 'none' });
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return {
      remove: async () => {
        window.removeEventListener('online', online);
        window.removeEventListener('offline', offline);
      },
    };
  },
};
