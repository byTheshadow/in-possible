// src/screens/ChatList.jsx
import { useEffect, useState } from 'react';
import Avatar, { avatarIndex } from '../components/Avatar';
import Screen from '../components/Screen';
import { announce } from '../services/announcer';
import { listChatSummaries } from '../services/chatService';
import { navigate, soonPath } from '../services/router';
import { playSound } from '../services/soundService';
import { formatListTime } from '../services/timeFormat';
import '../styles/chat.css';

// 点一行进入的聊天室地址：已经有聊天记录就按聊天 id 进；还没有就按角色 id 进，
// 聊天室会用这个角色的第一个聊天，没有就新建一个。
const chatPath = ({ chat, character }) => (chat?.id ? `/chat?id=${chat.id}` : `/chat?c=${character.id}`);

const previewText = (lastMessage) => {
  if (!lastMessage) return '还没有消息';
  return lastMessage.role === 'user' ? `我：${lastMessage.text}` : lastMessage.text;
};

export default function ChatList() {
  const [rows, setRows] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    listChatSummaries()
      .then((result) => {
        if (alive) setRows(result);
      })
      .catch((error) => {
        if (!alive) return;
        setFailed(true);
        announce(`读取聊天列表失败：${error?.message || '未知错误'}`, { assertive: true });
        playSound('error');
      });
    return () => {
      alive = false;
    };
  }, []);

  const go = (path) => {
    playSound('tap');
    navigate(path);
  };

  const actions = (
    <div className="chat-actions">
      <button type="button" className="btn btn-block" onClick={() => go('/apps')}>
        全部应用
      </button>
      <button type="button" className="btn btn-primary btn-block" onClick={() => go(soonPath('新建角色', '/chats'))}>
        新建角色
      </button>
    </div>
  );

  let body;
  if (failed) {
    body = (
      <div className="card stack" role="alert">
        <h2>读取失败</h2>
        <p>没能读出聊天列表。请刷新页面再试；如果一直这样，请到诊断页测试数据库。</p>
      </div>
    );
  } else if (rows === null) {
    body = (
      <p className="muted" role="status">
        正在读取……
      </p>
    );
  } else if (rows.length === 0) {
    body = (
      <div className="card stack">
        <h2>还没有角色</h2>
        <p>没有角色就没法聊天。创建角色的功能还在建设中。</p>
        {/* 开发用入口，正式发布前删掉 */}
        <button type="button" className="btn btn-block" onClick={() => go('/settings/diagnostics')}>
          去诊断页造示例角色（开发用）
        </button>
      </div>
    );
  } else {
    body = (
      <nav aria-label="角色列表">
        <ul className="list" role="list">
          {rows.map(({ character, chat, unread, lastMessage, sortAt }) => (
            <li key={character.id}>
              <a
                href={`#${chatPath({ chat, character })}`}
                className={`chat-card chat-card-k${avatarIndex(character) + 1}${unread > 0 ? ' is-unread' : ''}`}
                onClick={() => playSound('tap')}
              >
                <Avatar character={character} />
                <span className="chat-main">
                  <span className="chat-row">
                    <span className="chat-name">{character.name}</span>
                    <span className="chat-time">{formatListTime(lastMessage?.timestamp || sortAt)}</span>
                  </span>
                  <span className="chat-preview">{previewText(lastMessage)}</span>
                </span>
                {unread > 0 && <span className="chat-unread">未读 {unread}</span>}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    );
  }

  return (
    <Screen title="聊天" subtitle="选一个角色，继续聊。" actions={actions}>
      {body}
    </Screen>
  );
}