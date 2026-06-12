import './index.css';
import { getOrCreateRoot } from './react-root';
import { App } from './app/app';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Root element not found');
}

getOrCreateRoot(rootElement).render(<App />);
