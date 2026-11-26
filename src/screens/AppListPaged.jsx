import { useEffect, useMemo, useRef, useState } from 'react';
import { announce } from '../services/announcer';
import { listChatSummaries } from '../services/chatService';
import { formatListTime } from '../services/timeFormat';
import { navigate, soonPath } from '../services/router';
import { playSound } from '../services/soundService';
import '../styles/applist-paged.css';

const formatGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 6) return '夜深了，慢慢来。';
  if (hour < 11) return '早上好，先做什么？';
  if (hour < 14) return '中午好，先做什么？';
  if (hour < 18) return '下午好，先做什么？';
  return '晚上好，先做什么？';
};

const Icon = ({ name }) => {
  const common = { viewBox: '0 0 24 24', 'aria-hidden': true, focusable: false };
  if (name === 'calendar') return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 2v5M17 2v5M6 10h12" /></svg>;
  if (name === 'todo') return <svg {...common}><rect x="3" y="3" width="18" height="18" rx="5" /><path d="m7 12 3 3 7-7" /></svg>;
  if (name === 'remind') return <svg {...common}><path d="M12 3a6 6 0 0 0-6 6v4l-2 4h16l-2-4V9a6 6 0 0 0-6-6Z" /><path d="M10 20h4" /></svg>;
  if (name === 'roles') return <svg {...common}><circle cx="9" cy="8" r="4" /><path d="M1.5 21a7.5 7.5 0 0 1 15 0" /><circle cx="17.5" cy="7" r="3" /><path d="M15.6 13.4A6.5 6.5 0 0 1 22.5 20h-4.3" /></svg>;
  if (name === 'settings') return <svg {...common}><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="15" cy="6" r="2.5" /><circle cx="8" cy="12" r="2.5" /><circle cx="17" cy="18" r="2.5" /></svg>;
  if (name === 'memory') return <svg {...common}><rect x="4" y="3" width="14" height="17" rx="2" /><path d="M8 8h6M8 12h6M8 16h3" /><circle cx="18" cy="17" r="4" /></svg>;
  if (name === 'world') return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></svg>;
  if (name === 'knowledge') return <svg {...common}><rect x="6" y="2" width="15" height="17" rx="3" /><rect x="3" y="5" width="15" height="17" rx="3" /><path d="M7 11h7M7 15h7M7 19h4" /></svg>;
  if (name === 'character') return <svg {...common}><rect x="2" y="4" width="20" height="16" rx="3" /><circle cx="8" cy="10" r="2.5" /><path d="M4 17a4 4 0 0 1 8 0M14 9h5M14 13h5" /></svg>;
  if (name === 'relationship') return <svg {...common}><circle cx="8.5" cy="12" r="6.5" /><circle cx="15.5" cy="12" r="6.5" /></svg>;
  return <svg {...common}><path d="M5 12h13M13 6l6 6-6 6" /></svg>;
};

function DemoLink({ to, className = '', children }) {
  return <a className={`home-card ${className}`} href={`#${to}`} onClick={() => playSound('tap')}>{children}</a>;
}

function PageTabs({ page, onChange }) {
  return <div className="home-tabs" role="tablist" aria-label="主界面分页">
    {['陪伴', '资料'].map((label, index) => <button key={label} type="button" role="tab" aria-selected={page === index} aria-controls={`home-page-${index}`} tabIndex={page === index ? 0 : -1} onClick={() => onChange(index)}>{label}</button>)}
  </div>;
}

export default function AppListPaged() {
  const [recent, setRecent] = useState(null);
  const [page, setPage] = useState(0);
  const trackRef = useRef(null);

  useEffect(() => {
    document.title = '主界面 - 零极限';
    let alive = true;
    listChatSummaries().then((rows) => {
      if (alive) setRecent(rows.find((row) => row.lastMessage) || rows[0] || null);
    }).catch((error) => announce(`读取最近对话失败：${error?.message || '未知错误'}`, { assertive: true }));
    return () => { alive = false; };
  }, []);

  const recentText = recent?.lastMessage?.text || '还没有最近对话，去认识一个角色吧。';
  const recentTarget = recent?.chat?.id ? `/chat?id=${recent.chat.id}` : recent?.character?.id ? `/chat?c=${recent.character.id}` : '/chats';
  const recentLabel = recent?.character?.name ? `${recent.character.name}：${recentText}` : recentText;
  const recentWhen = recent?.lastMessage ? formatListTime(recent.lastMessage.timestamp) : '还没有消息';
  const pageNames = useMemo(() => ['陪伴', '资料'], []);
  const goToPage = (next) => {
    const target = Math.max(0, Math.min(1, next));
    setPage(target);
    trackRef.current?.scrollTo({ left: target * trackRef.current.clientWidth, behavior: 'smooth' });
  };
  const handleScroll = () => {
    if (!trackRef.current) return;
    const next = Math.round(trackRef.current.scrollLeft / trackRef.current.clientWidth);
    if (next !== page) setPage(next);
  };

  return <div className="home-shell">
    <header className="home-header">
      <div className="home-topbar"><span className="home-presence"><span className="home-presence-dot" aria-hidden="true" />陪伴空间已准备好</span><button type="button" className="home-display-button" aria-label="打开无障碍显示设置" onClick={() => { playSound('tap'); navigate('/settings/accessibility'); }}>Aa</button></div>
      <p className="home-wordmark" aria-label="in-possible">IN-POSSIBLE</p>
      <div className="home-heading"><h1>主界面</h1><p>{formatGreeting()}</p></div>
    </header>
    <main className="home-phone" aria-label="主界面">
      <div className="home-pager-bar"><PageTabs page={page} onChange={goToPage} /><div className="home-pager-status"><span>第 {page + 1} 屏 / 共 2 屏：{pageNames[page]}</span><span className="home-swipe-hint">可左右滑动</span></div></div>
      <div ref={trackRef} className="home-track" onScroll={handleScroll}>
        <section id="home-page-0" className="home-page" role="tabpanel" aria-labelledby="home-tab-0" aria-hidden={page !== 0}>
          <div className="home-screen-head"><h2>陪伴</h2><p>聊天和今天要做的事</p></div>
          <div className="home-bento home-bento-companion">
            <DemoLink className="home-chat" to="/chats"><span className="home-chat-scene" aria-hidden="true" /><span className="home-context-tag">带着记忆</span><span className="home-chat-plate"><span><strong>聊天</strong><small>和角色继续故事</small></span><Icon name="arrow" /></span></DemoLink>
            <DemoLink className="home-square home-cal" to={soonPath('日历', '/apps')}><Icon name="calendar" /><strong>日历</strong></DemoLink>
            <DemoLink className="home-square home-todo" to={soonPath('待办', '/apps')}><Icon name="todo" /><strong>待办</strong></DemoLink>
            <DemoLink className="home-square home-remind" to={soonPath('提醒', '/apps')}><Icon name="remind" /><strong>提醒</strong></DemoLink>
            <DemoLink className="home-square home-role" to="/characters"><Icon name="roles" /><strong>角色库</strong></DemoLink>
            <DemoLink className="home-continue" to={recentTarget}><span className="home-continue-meta">继续上次对话 · {recent?.character?.name || '还没有角色'} · {recentWhen}</span><strong>{recentLabel}</strong><span className="home-arrow-circle"><Icon name="arrow" /></span></DemoLink>
            <section className="home-today" aria-labelledby="home-today-title"><h3 id="home-today-title">今天</h3><strong>—</strong><p>日历、待办和提醒<br />准备好后会显示在这里</p></section>
            <DemoLink className="home-settings" to="/settings"><Icon name="settings" /><span><strong>设置</strong><small>主题、语音和隐私</small></span></DemoLink>
          </div>
          <button className="home-jump" type="button" onClick={() => goToPage(1)}><span><strong>聊天会参考的资料</strong><small>在第 2 屏：长期记忆、世界书、知识库</small></span><span className="home-arrow-circle"><Icon name="arrow" /></span></button>
        </section>
        <section id="home-page-1" className="home-page" role="tabpanel" aria-labelledby="home-tab-1" aria-hidden={page !== 1}>
          <div className="home-screen-head"><h2>资料</h2><p>聊天前会参考这里</p></div>
          <div className="home-bento home-bento-data">
            <DemoLink className="home-memory" to="/memories"><span className="home-kicker">长期记忆管理</span><strong>长期记忆</strong><p>按角色和聊天框查看、确认、编辑和停用记忆。</p><span className="home-memory-actions"><span>打开全部</span><span>按角色</span><span>按聊天框</span></span></DemoLink>
            <DemoLink className="home-info home-world" to={soonPath('世界书', '/apps')}><Icon name="world" /><strong>世界书</strong><p>管理世界观、地点、人物、规则和触发条件</p></DemoLink>
            <DemoLink className="home-info home-knowledge" to={soonPath('知识库', '/apps')}><Icon name="knowledge" /><strong>知识库</strong><p>保存角色聊天时可以参考的资料</p></DemoLink>
            <DemoLink className="home-info home-character" to={soonPath('角色设定与资源', '/apps')}><Icon name="character" /><strong>角色设定与资源</strong><p>核心身份、补充设定、世界书和知识库挂载</p></DemoLink>
            <DemoLink className="home-info home-relationship" to={soonPath('关系记录', '/apps')}><Icon name="relationship" /><strong>关系记录</strong><p>查看关系变化和重要共同经历</p></DemoLink>
          </div>
        </section>
      </div>
      <div className="home-footer"><button type="button" disabled={page === 0} onClick={() => goToPage(page - 1)}>← 上一屏</button><button type="button" disabled={page === 1} onClick={() => goToPage(page + 1)}>下一屏 →</button></div>
    </main>
  </div>;
}
