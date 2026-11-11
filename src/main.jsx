import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/base.css';
import App from './App';
import Announcer from './components/Announcer';
import ErrorBoundary from './components/ErrorBoundary';
import { announce } from './services/announcer';
import { initAccessibility } from './services/accessibilityService';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Announcer />
    <ErrorBoundary label="零极限">
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

// 读设置失败不能默默吞掉：用默认设置继续，并出声告诉用户
initAccessibility().catch((error) => {
  announce(`读取设置失败：${error?.message || '未知错误'}。已使用默认设置。`, { assertive: true });
});
