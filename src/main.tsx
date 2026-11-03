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

// 브라우저 알림용 서비스 워커 (배포본에서만)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      /* 알림 없이도 앱은 동작한다 */
    });
  });
}
