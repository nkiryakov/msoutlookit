import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { initRelay } from './relay.js';
import './styles.css';

// Before anything loads, so a Reddit tab that opened this page can answer the first request.
initRelay();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
