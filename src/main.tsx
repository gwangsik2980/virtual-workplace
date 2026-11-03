import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// 전역 스타일을 먼저 불러와야 화면별 CSS가 같은 우선순위에서 이긴다
import './styles.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
