import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app/App';
import './app/styles.css';
import './features/dish-editor/styles.css';

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    void updateSW(true);
  }
});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
