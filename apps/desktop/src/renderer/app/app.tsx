import { useEffect, useRef, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ChatPage } from '../features/chat/chat-page';
import { ConsolePage } from '../features/console/console-page';
import { DaemonConnectionScreen } from '../features/daemon-connection/daemon-connection-screen';
import { DaemonErrorDialog } from '../features/daemon-connection/daemon-error-dialog';
import { useDaemonConnection } from '../features/daemon-connection/use-daemon-connection';

export function App() {
  const isMacOS = window.cashew.platform === 'darwin';
  const { status, isConnected, isLoading, reconnect } = useDaemonConnection();
  const [hasEnteredHome, setHasEnteredHome] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const previousStatus = useRef(status.state);

  useEffect(() => {
    if (isConnected) {
      setHasEnteredHome(true);
      setDialogError(null);
    }
  }, [isConnected]);

  useEffect(() => {
    if (status.state === 'error' && previousStatus.current !== 'error') {
      setDialogError(status.message);
    }
    previousStatus.current = status.state;
  }, [status]);

  const handleReconnect = () => {
    setDialogError(null);
    reconnect().catch((error) => {
      setDialogError(error instanceof Error ? error.message : String(error));
    });
  };

  const showHome = hasEnteredHome || isConnected;

  return (
    <div className={isMacOS ? 'app-shell platform-darwin' : 'app-shell'}>
      {showHome ? (
        <HashRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/chat" replace />} />
            <Route
              path="/chat"
              element={
                <ChatPage
                  daemonStatus={status}
                  isConnected={isConnected}
                  onReconnect={handleReconnect}
                />
              }
            />
            <Route
              path="/chat/:sessionId"
              element={
                <ChatPage
                  daemonStatus={status}
                  isConnected={isConnected}
                  onReconnect={handleReconnect}
                />
              }
            />
            <Route path="/console" element={<ConsolePage />} />
            <Route path="*" element={<Navigate to="/chat" replace />} />
          </Routes>
        </HashRouter>
      ) : (
        <DaemonConnectionScreen status={status} onReconnect={handleReconnect} />
      )}

      {dialogError ? (
        <DaemonErrorDialog
          message={dialogError}
          isReconnecting={isLoading}
          onClose={() => setDialogError(null)}
          onReconnect={handleReconnect}
        />
      ) : null}
    </div>
  );
}
