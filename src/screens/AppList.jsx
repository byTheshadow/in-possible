// src/screens/AppList.jsx
import { useEffect, useState } from 'react';
import Screen from '../components/Screen';
import { announce } from '../services/announcer';
import { listChatSummaries } from '../services/chatService';
import { navigate, soonPath } from '../services/router';
import { formatListTime } from '../services/timeFormat';
import { playSound } from '../services/soundService';
import '../styles/applist.css';

const formatGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 6) return '夜深了，慢慢来。';
  if (hour < 11) return '早上好，先做什么？';
  if (hour < 14) return '中午好，记得休息。';
  if (hour < 18) return '下午好，先做什么？';
  return '晚上好，辛苦了。';
};

const Icon = ({ name }) => {
  const common = { viewBox: '0 0 24 24', 'aria-hidden': true, focusable: false };
  if (name === 'calendar') return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 2v5M17 2v5M6 10h12" /></svg>;
  if (name === 'todo') return <svg {...common}><rect x="3" y="3" width="18" height="18" rx="5" /><path d="m7 12 3 3 7-7" /></svg>;
  if (name === 'remind') return <svg {...common}><path d="M12 3a6 6 0 0 0-6 6v4l-2 4h16l-2-4V9a6 6 0 0 0-6-6Z" /><path d="M10 20h4" /></svg>;
  if (name === 'manual') return <svg {...common}><path d="M3 5c3-1 6-1 9 1v15c-3-2-6-2-9-1V5ZM21 5c-3-1-6-1-9 1v15c3-2 6-2 9-1V5Z" /></svg>;
  if (name === 'settings') return <svg {...common}><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="15" cy="6" r="2.5" /><circle cx="8" cy="12" r="2.5" /><circle cx="17" cy="18" r="2.5" /></svg>;
  return <svg {...common}><path d="M5 12h13M13 6l6 6-6 6" /></svg>;
};

const AppLink = ({ className, title, desc, to, icon, children }) => (
  <a className={`app-card ${className}`} href={`#${to}`} onClick={() => playSound('tap')}>
    {icon && <Icon name={icon} />}
    {children || <span className="app-card-copy"><strong>{title}</strong><span>{desc}</span></span>}
  </a>
);

export default function AppList() {
  const [recent, setRecent] = useState(null);

  useEffect(() => {
    let alive = true;
    listChatSummaries().then((rows) => {
      if (alive) setRecent(rows.find((row) => row.lastMessage) || rows[0] || null);
    }).catch((error) => announce(`读取最近对话失败：${error?.message || '未知错误'}`, { assertive: true }));
    return () => { alive = false; };
  }, []);

  const recentText = recent?.lastMessage?.text || '还没有最近对话，去认识一个角色吧。';
  const recentTarget = recent?.chat?.id ? `/chat?id=${recent.chat.id}` : recent?.character?.id ? `/chat?c=${recent.character.id}` : '/chats';
  const recentLabel = recent?.character?.name ? `${recent.character.name}：${recentText}` : recentText;

  return (
    <Screen title="应用列表" subtitle={formatGreeting()} headerTop={<div className="app-topbar"><span className="presence"><span className="presence-dot" aria-hidden="true" />陪伴空间已准备好</span>
      <button type="button" className="display-button" aria-label="打开无障碍显示设置" onClick={() => { playSound('tap'); navigate('/settings/accessibility'); }}>
        <span aria-hidden="true">Aa</span>
      </button>
    </div>}>
      <nav aria-label="全部应用">
        <div className="app-bento">
          <AppLink className="app-chat" to="/chats"><span className="chat-scene" aria-hidden="true" /><span className="chat-plate"><span><strong>聊天</strong><small>和角色一起继续故事</small></span><Icon name="arrow" /></span></AppLink>
          <AppLink className="app-square app-calendar" title="日历" desc="查看安排" icon="calendar" to={soonPath('日历', '/apps')} />
          <AppLink className="app-square app-todo" title="待办" desc="记下要做的事" icon="todo" to={soonPath('待办', '/apps')} />
          <AppLink className="app-square app-remind" title="提醒" desc="按时提醒你" icon="remind" to={soonPath('提醒', '/apps')} />
          <AppLink className="app-square app-manual" title="说明书" desc="了解怎么用" icon="manual" to={soonPath('说明书', '/apps')} />
          <AppLink className="app-continue" to={recentTarget}><span className="app-overline">{recent?.lastMessage ? `上次聊到 · ${formatListTime(recent.lastMessage.timestamp)}` : '开始第一次对话'}</span><strong>{recentLabel}</strong><span className="continue-action">继续对话 <Icon name="arrow" /></span></AppLink>
          <section className="app-today" aria-labelledby="today-title"><h2 id="today-title">今天</h2><strong className="today-number" aria-hidden="true">—</strong><p>日历、待办和提醒<br />准备好后会显示在这里</p></section>
          <AppLink className="app-settings" to="/settings"><Icon name="settings" /><span><strong>设置</strong><small>角色、语音和主题</small></span></AppLink>
        </div>
      </nav>
    </Screen>
  );
}
