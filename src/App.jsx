// src/App.jsx
import { useEffect, useState } from 'react';
import ErrorBoundary from './components/ErrorBoundary';
import AccessibilitySettings from './screens/AccessibilitySettings';
import AppList from './screens/AppList';
import Diagnostics from './screens/Diagnostics';
import Placeholder from './screens/Placeholder';
import Settings from './screens/Settings';
import Welcome from './screens/Welcome';
import { announce } from './services/announcer';
import { getSetting } from './services/db';
import { hasHash, navigate, useRoute } from './services/router';
import './styles/layout.css';

// 路由表。聊天列表、聊天室、日历做好后加到这里，并把聊天列表设为默认入口。
const ROUTES = {
  '/welcome': { Component: Welcome, label: '首次使用说明' },
  '/apps': { Component: AppList, label: '应用列表' },
  '/settings': { Component: Settings, label: '设置' },
  '/settings/accessibility': { Component: AccessibilitySettings, label: '无障碍设置' },
  '/settings/diagnostics': { Component: Diagnostics, label: '诊断页' },
  '/soon': { Component: Placeholder, label: '建设中' },
};

export default function App() {
  const { path } = useRoute();
  const [ready, setReady] = useState(false);

  // 第一次进入：没看过说明就去首次使用说明，看过就去应用列表。
  // 地址里已经有页面（刷新或书签）时不打扰，停在原地。
  useEffect(() => {
    let alive = true;
    (async () => {
      let seen = false;
      try {
        seen = await getSetting('welcomeSeen', false);
      } catch (error) {
        announce(`读取设置失败：${error?.message || '未知错误'}。已直接进入应用列表。`, { assertive: true });
        seen = true;
      }
      if (!alive) return;
      if (!hasHash()) navigate(seen ? '/apps' : '/welcome', { replace: true });
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const route = ROUTES[path];

  // 地址写错或不存在：回到应用列表，并告诉用户
  useEffect(() => {
    if (ready && path && !route) {
      announce('没有找到这个页面，已回到应用列表', { assertive: true });
      navigate('/apps', { replace: true });
    }
  }, [ready, path, route]);

  if (!ready || !route) return null;

  const { Component, label } = route;
  // key 用路径：换页面时错误边界一起重置，上一页的崩溃不会带到下一页
  return (
    <ErrorBoundary key={path} label={label}>
      <Component />
    </ErrorBoundary>
  );
}