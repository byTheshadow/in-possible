// src/screens/ChatRoom.jsx
import { useEffect, useMemo, useRef, useState } from 'react';
import Avatar, { avatarIndex } from '../components/Avatar';
import Screen from '../components/Screen';
import { getAccessibilitySettings, subscribeAccessibility } from '../services/accessibilityService';
import { AiError, buildChatMessages, DEFAULT_API_CONFIG, getApiConfig, isApiConfigured, requestReply } from '../services/aiService';
import { announce } from '../services/announcer';
import { bubbleInlineStyle } from '../services/bubbleStyle';
import { getCharacter } from '../services/chatService';
import {
  addCharacterMessage,
  addUserMessage,
  addVariant,
  getDialogName,
  listMessages,
  markChatRead,
  resolveChat,
  setVariantIndex,
} from '../services/messageService';
import { navigate, useRoute } from '../services/router';
import { playSound } from '../services/soundService';
import { formatClock } from '../services/timeFormat';
import '../styles/chat.css';
import '../styles/chatroom.css';

// 聊天室。
//   包 2a：消息读写、“发送”只发气泡、引用、进入清零未读。
//   包 2b：“让 TA 回复”调用 AI（整段返回，不做流式）、暂停、重新生成（保留旧回复，可来回看）、打字指示器、报错播报。
//   包 2c-1：聊天设置页（/chat/settings）；在输入区里输入时，底部“返回聊天列表”和“聊天设置”在画面上收起，读屏仍然读得到。

const NO_AI_TEXT = '还没填 AI 接入，所以现在没有回复。你发出的消息都已经保存好了。请先到设置里的“AI 接入”填好接口地址、密钥和模型。';

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

function RerollIcon() {
  return (
    <svg aria-hidden="true" className="cr-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 11a8 8 0 0 0-14.3-4.6M4 4v4h4" />
      <path d="M4 13a8 8 0 0 0 14.3 4.6M20 20v-4h-4" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg aria-hidden="true" className="cr-icon" viewBox="0 0 24 24" fill="currentColor">
      <rect x="5" y="4" width="5" height="16" rx="1.5" />
      <rect x="14" y="4" width="5" height="16" rx="1.5" />
    </svg>
  );
}

// 打字指示器：三点跳动、文字、波浪。动画只是装饰，文字“正在输入”一直都在（读屏也读得到）。
function TypingIndicator({ style, name }) {
  let inner;
  if (style === 'wave') {
    inner = [0, 1, 2, 3, 4].map((i) => <span key={i} className="cr-bar" style={{ animationDelay: `${i * 0.12}s` }} />);
  } else if (style === 'text') {
    inner = <span className="cr-typing-label">正在输入……</span>;
  } else {
    inner = [0, 1, 2].map((i) => <span key={i} className="cr-dot" style={{ animationDelay: `${i * 0.15}s` }} />);
  }
  return (
    <span className="cr-typing">
      {inner}
      <span className="sr-only">{name}正在输入</span>
    </span>
  );
}

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
  const [config, setConfig] = useState(null);
  const [dialogName, setDialogName] = useState('');
  const [generating, setGenerating] = useState(false);
  const [aiError, setAiError] = useState('');
  // 输入区里有东西拿着焦点（输入框、发送、让 TA 回复、取消引用）：底部两个按钮在画面上收起
  const [typing, setTyping] = useState(false);

  const composerRef = useRef(null);
  const typingTimerRef = useRef(null);
  const inputRef = useRef(null);
  const endRef = useRef(null);
  const primaryRef = useRef(null);
  const abortRef = useRef(null);
  const huge = useFontScale() >= 2;
  const hugeClass = huge ? ' cr-huge' : '';
  const configured = isApiConfigured(config);

  // AI 接入设置。从设置页回来时这个页面会重新挂载，所以这里总是读到最新的。
  useEffect(() => {
    let alive = true;
    getApiConfig()
      .then((result) => {
        if (alive) setConfig(result);
      })
      .catch((error) => {
        if (!alive) return;
        setConfig({ ...DEFAULT_API_CONFIG });
        announce(`读取 AI 接入设置失败：${error?.message || '未知错误'}`, { assertive: true });
        playSound('error');
      });
    return () => {
      alive = false;
    };
  }, []);

  // 换聊天或离开页面时，正在等的回复直接放弃，不留半条
  useEffect(
    () => () => {
      if (abortRef.current) {
        abortRef.current.leaving = true;
        abortRef.current.abort();
      }
    },
    [idParam, characterParam]
  );

  useEffect(() => {
    let alive = true;
    setStatus('loading');
    setGenerating(false);
    setAiError('');
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
        const [rows, name] = await Promise.all([listMessages(found.id), getDialogName(found)]);
        if (!alive) return;
        setDialogName(name);
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

  // 有新消息或状态变化时滚到最底下（焦点不动，读屏用户不会被带走）
  useEffect(() => {
    if (status === 'ready' && endRef.current) endRef.current.scrollIntoView({ block: 'end' });
  }, [status, messages.length, generating, aiError]);

  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);

  // 按当前焦点重新判断“是不是正在输入区里”
  const syncTyping = () => {
    const box = composerRef.current;
    setTyping(Boolean(box) && box.contains(document.activeElement));
  };

  // 获得焦点：马上收起。失去焦点：等一小会儿再判断，
  // 这样点“发送”时按钮不会因为底部按钮突然冒出来而被挤走、点偏。
  const onComposerFocus = () => {
    window.clearTimeout(typingTimerRef.current);
    setTyping(true);
    // 键盘弹出、页面变矮之后，让最新的消息还留在能看到的地方
    window.setTimeout(() => {
      if (endRef.current) endRef.current.scrollIntoView({ block: 'end' });
    }, 350);
  };
  const onComposerBlur = () => {
    window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(syncTyping, 250);
  };

  // 等待回复时输入框被禁用、焦点会丢，有的浏览器这时不发失焦事件，所以状态变化后补判断一次
  useEffect(() => {
    window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(syncTyping, 300);
    return () => window.clearTimeout(typingTimerRef.current);
  }, [generating, status]);

  const userName = chat?.userProfile?.name || '我';
  // 用户自己的头像（和角色头像共用 Avatar；颜色按聊天 id 轮换）
  const userPerson = useMemo(
    () => ({ id: chat?.id, name: userName, avatar: chat?.userProfile?.avatar, avatarImageId: chat?.userProfile?.avatarImageId ?? null }),
    [chat, userName]
  );
  const roleName = (message) => (message.role === 'user' ? userName : character?.name || '');
  const inputHint = chat?.userProfile?.inputHint || '说点什么……';
  const typingStyle = chat?.typingStyle || 'dots';
  // 气泡颜色（每个聊天各自的设置）；默认时是 undefined，沿用样式表里的颜色
  const characterBubbleStyle = bubbleInlineStyle(chat?.bubbleStyle?.character);
  const userBubbleStyle = bubbleInlineStyle(chat?.bubbleStyle?.user);

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

  // 存一条用户消息，成功返回存好的消息，失败返回 null
  const sendCore = async () => {
    const body = text.trim();
    if (!body) {
      announce('还没有写内容，不能发送', { assertive: true });
      playSound('error');
      focusInput();
      return null;
    }
    if (sending || !chat) return null;
    setSending(true);
    try {
      const saved = await addUserMessage({ chatId: chat.id, text: body, quoteOfId: quoting ? quoting.id : null });
      setMessages((previous) => [...previous, saved]);
      setText('');
      setQuoting(null);
      setAiError('');
      return saved;
    } catch (error) {
      announce(`保存失败，消息还留在输入框里：${error?.message || '未知错误'}`, { assertive: true });
      playSound('error');
      return null;
    } finally {
      setSending(false);
    }
  };

  const send = async () => {
    if (generating) return;
    const saved = await sendCore();
    if (saved) {
      playSound('success');
      announce('已发送');
      focusInput();
    }
  };

  // 把 history 交给 AI 并等整段回复。reroll 有值时是重新生成那一条。
  const generate = async ({ history, reroll = null, focusPrimary = false }) => {
    const controller = new AbortController();
    controller.leaving = false;
    abortRef.current = controller;
    setAiError('');
    setGenerating(true);
    playSound('tap');
    announce(`${character.name}正在输入`);
    if (focusPrimary) window.setTimeout(() => primaryRef.current && primaryRef.current.focus(), 0);

    try {
      const payload = buildChatMessages({
        character,
        chat,
        history,
        allMessages: messages,
        userName: chat.userProfile.name || '用户',
      });
      const reply = await requestReply({ config, messages: payload, signal: controller.signal });
      if (controller.signal.aborted) throw new AiError('已暂停', 'aborted');

      if (reroll) {
        const updated = await addVariant({ chatId: chat.id, messageId: reroll.id, text: reply });
        setMessages((previous) => previous.map((m) => (m.id === updated.id ? updated : m)));
        if (!controller.leaving) announce(`已重新生成，现在是第 ${updated.variants.length} 条，共 ${updated.variants.length} 条。${character.name}说：${reply}`);
      } else {
        const savedReply = await addCharacterMessage({ chatId: chat.id, text: reply });
        setMessages((previous) => [...previous, savedReply]);
        if (!controller.leaving) announce(`${character.name}回复：${reply}`);
      }
      if (!controller.leaving) playSound('receive');
    } catch (error) {
      if (controller.leaving) return;
      if (error?.kind === 'aborted') {
        playSound('tap');
        announce('已暂停，没有留下半条回复');
      } else {
        const reason = error?.message || '未知错误';
        setAiError(reason);
        playSound('error');
        announce(`${character.name}没能回复：${reason}`, { assertive: true });
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      if (!controller.leaving) setGenerating(false);
    }
  };

  const announceNoAi = () => {
    playSound('tap');
    announce(NO_AI_TEXT, { assertive: true });
  };

  const askAi = async () => {
    if (generating || !chat || !character) return;
    if (!configured) {
      announceNoAi();
      return;
    }
    // 输入框里还有没发送的字：先发出去，再让 TA 回复
    let history = messages;
    if (text.trim()) {
      const savedNow = await sendCore();
      if (!savedNow) return;
      history = [...messages, savedNow];
    }
    if (history.length === 0) {
      announce('还没有消息。先写一句，再让 TA 回复', { assertive: true });
      playSound('error');
      focusInput();
      return;
    }
    if (history[history.length - 1].role !== 'user') {
      announce(`${character.name}刚刚已经回复过了。想再来一次，请点“重新生成”；也可以先发一条新消息。`, { assertive: true });
      playSound('error');
      return;
    }
    await generate({ history });
  };

  const pause = () => {
    if (abortRef.current) abortRef.current.abort();
  };

  const rerollMessage = async (message) => {
    if (generating || !chat || !character) return;
    if (!configured) {
      announceNoAi();
      return;
    }
    const index = messages.findIndex((m) => m.id === message.id);
    if (index < 0) return;
    await generate({ history: messages.slice(0, index), reroll: message, focusPrimary: true });
  };

  const switchVariant = async (message, delta) => {
    const next = message.variantIndex + delta;
    if (next < 0) {
      announce('已经是第一条了');
      return;
    }
    if (next >= message.variants.length) {
      announce('已经是最后一条了');
      return;
    }
    try {
      const updated = await setVariantIndex({ chatId: chat.id, messageId: message.id, index: next });
      setMessages((previous) => previous.map((m) => (m.id === updated.id ? updated : m)));
      playSound('tap');
      announce(`第 ${next + 1} 条，共 ${updated.variants.length} 条：${updated.text}`);
    } catch (error) {
      announce(`切换失败：${error?.message || '未知错误'}`, { assertive: true });
      playSound('error');
    }
  };

  const go = (path) => {
    playSound('tap');
    navigate(path);
  };

  const here = chat ? `/chat?id=${chat.id}` : '/chats';

  const renderMessage = (message, index) => {
    const isUser = message.role === 'user';
    const who = roleName(message);
    const time = formatClock(message.timestamp);
    const previous = messages[index - 1];
    const showDay = !previous || dayKey(previous.timestamp) !== dayKey(message.timestamp);
    const colorClass = `cr-bubble-k${avatarIndex(character) + 1}`;
    const isLatest = index === messages.length - 1;

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
      <button
        type="button"
        className="btn cr-btn-quote"
        disabled={generating}
        aria-label={`引用${who} ${time} 的消息${generating ? '，等待回复时不能用' : ''}`}
        onClick={() => quoteMessage(message)}
      >
        <span className="cr-qmark" aria-hidden="true">
          {MARK}
        </span>
        引用
      </button>
    );

    // 只有最新的一条角色回复能重新生成、来回切换
    const canReroll = !isUser && isLatest;
    const rerollButton = canReroll ? (
      <button
        type="button"
        className="btn cr-btn-reroll"
        disabled={generating}
        aria-label={`重新生成${who}这条回复${generating ? '，等待回复时不能用' : ''}`}
        onClick={() => rerollMessage(message)}
      >
        <RerollIcon />
        重新生成
      </button>
    ) : null;

    const variantRow =
      canReroll && message.variants.length > 1 ? (
        <div className="cr-variant">
          <p className="cr-variant-label">
            第 {message.variantIndex + 1} 条，共 {message.variants.length} 条
          </p>
          <div className="cr-actions">
            <button
              type="button"
              className={`btn cr-btn-small${message.variantIndex === 0 ? ' is-end' : ''}`}
              disabled={generating}
              aria-disabled={message.variantIndex === 0 ? 'true' : undefined}
              aria-label="看上一条回复"
              onClick={() => switchVariant(message, -1)}
            >
              上一条
            </button>
            <button
              type="button"
              className={`btn cr-btn-small${message.variantIndex === message.variants.length - 1 ? ' is-end' : ''}`}
              disabled={generating}
              aria-disabled={message.variantIndex === message.variants.length - 1 ? 'true' : undefined}
              aria-label="看下一条回复"
              onClick={() => switchVariant(message, 1)}
            >
              下一条
            </button>
          </div>
        </div>
      ) : null;

    return (
      <li key={message.id}>
        {showDay && <p className="cr-day">{dayLabel(message.timestamp)}</p>}
        <article className={`cr-msg ${isUser ? 'cr-msg-user' : 'cr-msg-character'}`}>
          {!isUser && !huge && <Avatar character={character} size="md" />}
          <div className="cr-col">
            <p className="cr-meta">
              {huge && <Avatar character={isUser ? userPerson : character} size="xs" />}
              {who} · {time}
            </p>
            <div className={`cr-bubble ${isUser ? '' : colorClass}`} style={isUser ? userBubbleStyle : characterBubbleStyle}>
              {quoteBlock}
              {message.text}
            </div>
            <div className="cr-actions">
              {quoteButton}
              {rerollButton}
            </div>
            {variantRow}
          </div>
          {isUser && !huge && <Avatar character={userPerson} size="md" />}
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
    const colorClass = `cr-bubble-k${avatarIndex(character) + 1}`;
    body = (
      <ul className={`cr-flow${hugeClass}`} role="list" aria-label="消息">
        {messages.length === 0 && (
          <li>
            <p className="muted">还没有消息。在下面写一句，点“发送”。</p>
          </li>
        )}
        {messages.map(renderMessage)}

        {generating && (
          <li>
            <article className="cr-msg cr-msg-character">
              {!huge && <Avatar character={character} size="md" />}
              <div className="cr-col">
                <p className="cr-meta">
                  {huge && <Avatar character={character} size="xs" />}
                  {character.name}
                </p>
                <div className={`cr-bubble ${colorClass}`} style={characterBubbleStyle}>
                  <TypingIndicator style={typingStyle} name={character.name} />
                </div>
              </div>
            </article>
          </li>
        )}

        {aiError && (
          <li>
            <div className="cr-hint cr-error">
              <p className="cr-hint-title">出错了</p>
              <p>{aiError}</p>
              <p>消息都还在。可以再点“让 TA 回复”重试。</p>
            </div>
          </li>
        )}

        {config !== null && !configured && (
          <li>
            <div className="cr-hint">
              <p className="cr-hint-title">提示</p>
              <p>{NO_AI_TEXT}</p>
              <button type="button" className="btn btn-block cr-hint-btn" onClick={() => go(`/settings/ai?from=${encodeURIComponent(here)}`)}>
                去填写 AI 接入
              </button>
            </div>
          </li>
        )}
        <li ref={endRef} aria-hidden="true" />
      </ul>
    );
  }

  const composer =
    status === 'ready' ? (
      <section ref={composerRef} className={`cr-composer${hugeClass}`} aria-label="输入消息" onFocus={onComposerFocus} onBlur={onComposerBlur}>
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
            <button type="button" className="btn" disabled={generating} onClick={cancelQuote}>
              取消引用
            </button>
          </div>
        )}
        <label htmlFor="cr-input" className="sr-only">
          {generating ? `给${character?.name}发消息（等待回复时不能输入）` : `给${character?.name}发消息`}
        </label>
        <textarea
          id="cr-input"
          ref={inputRef}
          className="cr-input"
          rows={2}
          value={text}
          disabled={generating}
          placeholder={inputHint}
          onChange={(event) => setText(event.target.value)}
        />
        {generating && (
          <p className="cr-wait">
            {character?.name}正在输入……点“暂停”可以中断。等待期间不能发送，也不能追加新消息。
          </p>
        )}
        <div className="cr-btn-row">
          <button type="button" className="btn cr-send" onClick={send} disabled={generating || sending}>
            发送
          </button>
          <button
            type="button"
            ref={primaryRef}
            className={generating ? 'btn cr-pause' : 'btn btn-primary'}
            onClick={generating ? pause : askAi}
          >
            {generating ? (
              <>
                <PauseIcon />
                暂停
              </>
            ) : (
              '让 TA 回复'
            )}
          </button>
        </div>
      </section>
    ) : null;

  const backPath = '/chats';

  const actions = (
    <>
      {composer}
      <nav className={`cr-nav${hugeClass}${typing ? ' is-away' : ''}`} aria-label="页面操作">
        <button type="button" className="btn" onClick={() => go(backPath)}>
          返回聊天列表
        </button>
        {status === 'ready' && (
          <button type="button" className="btn" onClick={() => go(`/chat/settings?id=${chat.id}`)}>
            聊天设置
          </button>
        )}
      </nav>
    </>
  );

  let subtitle = 'AI 还没接入';
  if (config === null) subtitle = undefined;
  else if (configured) subtitle = `AI：${config.model}`;
  if (dialogName) subtitle = subtitle ? `${dialogName} · ${subtitle}` : dialogName;

  return (
    <Screen
      title={character ? character.name : '聊天'}
      docTitle={character ? `和${character.name}聊天` : '聊天'}
      subtitle={subtitle}
      fixed
      leading={character ? <Avatar character={character} size="lg" /> : null}
      actions={actions}
    >
      {body}
    </Screen>
  );
}