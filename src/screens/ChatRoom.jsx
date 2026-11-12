// src/screens/ChatRoom.jsx
import { useEffect, useMemo, useRef, useState } from 'react';
import Avatar, { avatarIndex } from '../components/Avatar';
import Screen from '../components/Screen';
import { getAccessibilitySettings, subscribeAccessibility } from '../services/accessibilityService';
import { announce } from '../services/announcer';
import { getCharacter } from '../services/chatService';
import { addUserMessage, listMessages, markChatRead, resolveChat } from '../services/messageService';
import { navigate, soonPath, useRoute } from '../services/router';
import { playSound } from '../services/soundService';
import { formatClock } from '../services/timeFormat';
import '../styles/chat.css';
import '../styles/chatroom.css';

// 聊天室（包 2a）：消息读写、发送只发气泡、引用、进入清零未读、如实提示还没接入 AI。
// 还没做的（后面的包）：触发 AI 生成、暂停、重新生成、打字指示器（2b）；聊天设置页（2c）。

const AI_CONNECTED = false;
const NO_AI_TEXT = '还没接入 AI，所以现在没有回复。你发出的消息都已经保存好了。';

const MARK = '“';

const dayKey = (timestamp) => new Date(timestamp).toDateString();

const dayLabel = (timestamp, now = Date.now()) => {
  const date = new Date(timestamp);
  const start = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((start(new Date(now)) - start(date)) / 86400000);
  if (days <= 0) return '今天';
  if (days === 1) return '昨天';
  return `${date.getMonth() + 1}月${date.getDate()}日`;
};

const useFontScale = () => {
  const [scale, setScale] = useState(getAccessibilitySettings().fontScale);
  useEffect(() => subscribeAccessibility((settings) => setScale(settings.fontScale)), []);
  return scale;
};

export default function ChatRoom() {
  const { query } = useRoute();
  const idParam = query.get('id');
  const characterParam = query.get('c');

  const [status, setStatus] = useState('loading'); // loading | ready | missing | failed
  const [chat, setChat] = useState(null);
  const [character, setCharacter] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [quoting, setQuoting] = useState(null);
  const [sending, setSending] = useState(false);

  const inputRef = useRef(null);
  const endRef = useRef(null);
  const huge = useFontScale() >= 2;
  const hugeClass = huge ? ' cr-huge' : '';

  useEffect(() => {
    let alive = true;
    setStatus('loading');
    (async () => {
      try {
        const found = await resolveChat({ chatId: idParam, characterId: characterParam });
        const owner = found ? await getCharacter(found.characterId) : null;
        if (!alive) return;
        if (!found || !owner) {
          setStatus('missing');
          announce('没有找到这个聊天', { assertive: true });
          playSound('error');
          return;
        }
        const rows = await listMessages(found.id);
        if (!alive) return;
        setChat(found);
        setCharacter(owner);
        setMessages(rows);
        setStatus('ready');

        if (found.unread > 0) {
          try {
            await markChatRead(found.id);
            if (alive) announce(`${owner.name}，${found.unread} 条新消息`);
          } catch (error) {
            if (alive) announce(`没能把未读清零：${error?.message || '未知错误'}`, { assertive: true });
          }
        }
      } catch (error) {
        if (!alive) return;
        setStatus('failed');
        announce(`读取聊天失败：${error?.message || '未知错误'}`, { assertive: true });
        playSound('error');
      }
    })();
    return () => {
      alive = false;
    };
  }, [idParam, characterParam]);

  // 有新消息时滚到最底下（焦点不动，读屏用户不会被带走）
  useEffect(() => {
    if (status === 'ready' && endRef.current) endRef.current.scrollIntoView({ block: 'end' });
  }, [status, messages.length]);

  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);

  const userName = chat?.userProfile?.name || '我';
  const roleName = (message) => (message.role === 'user' ? userName : character?.name || '');
  const inputHint = chat?.userProfile?.inputHint || '说点什么……';

  const focusInput = () => {
    if (inputRef.current) inputRef.current.focus();
  };

  const quoteMessage = (message) => {
    const who = roleName(message);
    const time = formatClock(message.timestamp);
    setQuoting({ id: message.id, who, time, text: message.text });
    playSound('tap');
    announce(`正在引用${who} ${time} 的消息`);
    focusInput();
  };

  const cancelQuote = () => {
    setQuoting(null);
    playSound('tap');
    announce('已取消引用');
    focusInput();
  };

  const send = async () => {
    const body = text.trim();
    if (!body) {
      announce('还没有写内容，不能发送', { assertive: true });
      playSound('error');
      focusInput();
      return;
    }
    if (sending || !chat) return;
    setSending(true);
    try {
      const saved = await addUserMessage({ chatId: chat.id, text: body, quoteOfId: quoting ? quoting.id : null });
      setMessages((previous) => [...previous, saved]);
      setText('');
      setQuoting(null);
      playSound('success');
      announce('已发送');
      focusInput();
    } catch (error) {
      announce(`保存失败，消息还留在输入框里：${error?.message || '未知错误'}`, { assertive: true });
      playSound('error');
    } finally {
      setSending(false);
    }
  };

  // 包 2a 没有 AI：如实说明，不假装角色回复。2b 会把这里换成真的生成。
  const askAi = () => {
    playSound('tap');
    announce(NO_AI_TEXT, { assertive: true });
  };

  const go = (path) => {
    playSound('tap');
    navigate(path);
  };

  const renderMessage = (message, index) => {
    const isUser = message.role === 'user';
    const who = roleName(message);
    const time = formatClock(message.timestamp);
    const previous = messages[index - 1];
    const showDay = !previous || dayKey(previous.timestamp) !== dayKey(message.timestamp);
    const colorClass = `cr-bubble-k${avatarIndex(character) + 1}`;

    if (message.role === 'system') {
      return (
        <li key={message.id}>
          {showDay && <p className="cr-day">{dayLabel(message.timestamp)}</p>}
          <div className="cr-hint">
            <p className="cr-hint-title">提示</p>
            <p>{message.text}</p>
          </div>
        </li>
      );
    }

    const quoted = message.quoteOfId != null ? byId.get(message.quoteOfId) : null;
    const quoteBlock =
      message.quoteOfId != null ? (
        <div className="cr-quote-in">
          <span className="cr-qmark" aria-hidden="true">
            {MARK}
          </span>
          <div className="cr-quote-in-body">
            <p className="cr-quote-in-who">{quoted ? `引用 ${roleName(quoted)} ${formatClock(quoted.timestamp)}` : '引用'}</p>
            <p className="cr-quote-in-text">{quoted ? quoted.text : '被引用的消息已经不在了'}</p>
          </div>
        </div>
      ) : null;

    const quoteButton = (
      <button type="button" className="btn cr-btn-quote" aria-label={`引用${who} ${time} 的消息`} onClick={() => quoteMessage(message)}>
        <span className="cr-qmark" aria-hidden="true">
          {MARK}
        </span>
        引用
      </button>
    );

    return (
      <li key={message.id}>
        {showDay && <p className="cr-day">{dayLabel(message.timestamp)}</p>}
        <article className={`cr-msg ${isUser ? 'cr-msg-user' : 'cr-msg-character'}`}>
          {!isUser && !huge && <Avatar character={character} size="md" />}
          <div className="cr-col">
            <p className="cr-meta">
              {!isUser && huge && <Avatar character={character} size="xs" />}
              {who} · {time}
            </p>
            <div className={`cr-bubble ${isUser ? '' : colorClass}`}>
              {quoteBlock}
              {message.text}
            </div>
            <div className="cr-actions">{quoteButton}</div>
          </div>
        </article>
      </li>
    );
  };

  let body;
  if (status === 'loading') {
    body = (
      <p className="muted" role="status">
        正在读取……
      </p>
    );
  } else if (status === 'missing') {
    body = (
      <div className="card stack">
        <h2>没有找到这个聊天</h2>
        <p>这个聊天或者它的角色已经不在了。请回到聊天列表。</p>
      </div>
    );
  } else if (status === 'failed') {
    body = (
      <div className="card stack" role="alert">
        <h2>读取失败</h2>
        <p>没能读出这个聊天。请刷新页面再试；如果一直这样，请到诊断页测试数据库。</p>
      </div>
    );
  } else {
    body = (
      <ul className={`cr-flow${hugeClass}`} role="list" aria-label="消息">
        {messages.length === 0 && (
          <li>
            <p className="muted">还没有消息。在下面写一句，点“发送”。</p>
          </li>
        )}
        {messages.map(renderMessage)}
        {!AI_CONNECTED && (
          <li>
            <div className="cr-hint">
              <p className="cr-hint-title">提示</p>
              <p>{NO_AI_TEXT}</p>
            </div>
          </li>
        )}
        <li ref={endRef} aria-hidden="true" />
      </ul>
    );
  }

  const composer =
    status === 'ready' ? (
      <section className={`cr-composer${hugeClass}`} aria-label="输入消息">
        {quoting && (
          <div className="cr-quote-chip">
            <span className="cr-qmark" aria-hidden="true">
              {MARK}
            </span>
            <div className="cr-quote-chip-body">
              <p className="cr-quote-chip-who">
                正在引用 {quoting.who} {quoting.time}
              </p>
              <p className="cr-quote-chip-text">{quoting.text}</p>
            </div>
            <button type="button" className="btn" onClick={cancelQuote}>
              取消引用
            </button>
          </div>
        )}
        <label htmlFor="cr-input" className="sr-only">
          给{character?.name}发消息
        </label>
        <textarea
          id="cr-input"
          ref={inputRef}
          className="cr-input"
          rows={2}
          value={text}
          placeholder={inputHint}
          onChange={(event) => setText(event.target.value)}
        />
        <div className="cr-btn-row">
          <button type="button" className="btn cr-send" onClick={send} disabled={sending}>
            发送
          </button>
          <button type="button" className="btn btn-primary" onClick={askAi}>
            让 TA 回复
          </button>
        </div>
      </section>
    ) : null;

  const backPath = '/chats';
  const here = chat ? `/chat?id=${chat.id}` : backPath;

  const actions = (
    <>
      {composer}
      <nav className={`cr-nav${hugeClass}`} aria-label="页面操作">
        <button type="button" className="btn" onClick={() => go(backPath)}>
          返回聊天列表
        </button>
        {status === 'ready' && (
          <button type="button" className="btn" onClick={() => go(soonPath('聊天设置', here))}>
            聊天设置
          </button>
        )}
      </nav>
    </>
  );

  return (
    <Screen
      title={character ? character.name : '聊天'}
      docTitle={character ? `和${character.name}聊天` : '聊天'}
      subtitle={AI_CONNECTED ? undefined : 'AI 还没接入'}
      leading={character ? <Avatar character={character} size="lg" /> : null}
      actions={actions}
    >
      {body}
    </Screen>
  );
}