import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ChatPage } from '../pages/chat/chat-page';
import { ConsolePage } from '../pages/console/console-page';

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/chat" replace />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/chat/:sessionId" element={<ChatPage />} />
        <Route path="/console" element={<ConsolePage />} />
        <Route path="*" element={<Navigate to="/chat" replace />} />
      </Routes>
    </HashRouter>
  );
}
