type DaemonReconnectAPI = {
  reconnectDaemon?: () => Promise<void>;
};

export async function requestDaemonReconnect(
  api: DaemonReconnectAPI,
  reload: () => void = () => window.location.reload(),
): Promise<void> {
  if (typeof api.reconnectDaemon !== 'function') {
    reload();
    return;
  }

  await api.reconnectDaemon();
}
