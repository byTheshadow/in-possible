// src/App.jsx
import { useEffect, useState } from 'react';
import ErrorBoundary from './components/ErrorBoundary';
import AccessibilitySettings from './screens/AccessibilitySettings';
import AiSettings from './screens/AiSettings';
import AppList from './screens/AppList';
import CharacterEdit from './screens/CharacterEdit';
import Characters from './screens/Characters';
import ChatRoom from './screens/ChatRoom';
import ChatList from './screens/ChatList';
import NewChat from './screens/NewChat';
import ChatSettings from './screens/ChatSettings';
import Diagnostics from './screens/Diagnostics';
import Placeholder from './screens/Placeholder';
import Settings from './screens/Settings';
import Welcome from './screens/Welcome';
import { announce } from './services/announcer';
import { getSetting } from './services/db';
import { hasHash, navigate, useRoute } from './services/router';
import './styles/layout.css';

// 路由表。日历等页面做好后加到这里。角色库是 /characters，编辑和新建是 /characters/edit（?id=角色id，不带 id 是新建）。聊天室的地址是 /chat?id=聊天id（或 /chat?c=角色id），聊天设置是 /chat/settings?id=聊天id。
const ROUTES = {
  '/welcome': { Component: Welcome, label: '首次使用说明' },
  '/chats': { Component: ChatList, label: '聊天列表' },
  '/chats/new': { Component: NewChat, label: '新建对话' },
  '/characters': { Component: Characters, label: '角色库' },
  '/characters/edit': { Component: CharacterEdit, label: '编辑角色' },
  '/chat': { Component: ChatRoom, label: '聊天室' },
  '/chat/settings': { Component: ChatSettings, label: '聊天设置' },
  '/apps': { Component: AppList, label: '应用列表' },
  '/settings': { Component: Settings, label: '设置' },
  '/settings/ai': { Component: AiSettings, label: 'AI 接入' },
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
      if (!hasHash()) navigate(seen ? '/chats' : '/welcome', { replace: true });
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