import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';

try { if (localStorage.getItem('lh-theme') === 'dark' || (!localStorage.getItem('lh-theme') && matchMedia('(prefers-color-scheme: dark)').matches)) document.documentElement.classList.add('dark'); } catch { /* ignore */ }
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
