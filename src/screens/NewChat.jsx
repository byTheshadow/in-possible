// src/screens/NewChat.jsx
import { useEffect, useState } from 'react';
import Avatar from '../components/Avatar';
import Screen from '../components/Screen';
import { announce } from '../services/announcer';
import { createChat, listChatSummaries } from '../services/chatService';
import { getDialogName } from '../services/messageService';
import { navigate } from '../services/router';
import { playSound } from '../services/soundService';
import '../styles/chat.css';

// 新建对话（包 2c-2）：先选一个角色，再为它新开一个对话，然后直接进入聊天室。
// 同一个角色可以有好几个对话，每个对话的消息、设置、气泡颜色都各自独立。

export default function NewChat() {
  const [characters, setCharacters] = useState(null); // [{ character, count }]
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    let alive = true;
    listChatSummaries()
      .then((rows) => {
        if (!alive) return;
        const map = new Map();
        rows.forEach(({ character, chat }) => {
          const entry = map.get(character.id) || { character, count: 0 };
          if (chat) entry.count += 1;
          map.set(character.id, entry);
        });
        setCharacters(Array.from(map.values()).sort((a, b) => a.character.id - b.character.id));
      })
      .catch((error) => {
        if (!alive) return;
        setFailed(true);
        announce(`读取角色失败：${error?.message || '未知错误'}`, { assertive: true });
        playSound('error');
      });
    return () => {
      alive = false;
    };
  }, []);

  const start = async (character) => {
    if (busyId !== null) return;
    setBusyId(character.id);
    playSound('tap');
    try {
      const chat = await createChat(character.id);
      const name = await getDialogName(chat);
      announce(`已为${character.name}新建“${name}”`);
      playSound('success');
      navigate(`/chat?id=${chat.id}`);
    } catch (error) {
      setBusyId(null);
      announce(`新建失败：${error?.message || '未知错误'}`, { assertive: true });
      playSound('error');
    }
  };

  let body;
  if (failed) {
    body = (
      <div className="card stack" role="alert">
        <h2>读取失败</h2>
        <p>没能读出角色。请刷新页面再试；如果一直这样，请到诊断页测试数据库。</p>
      </div>
    );
  } else if (characters === null) {
    body = (
      <p className="muted" role="status">
        正在读取……
      </p>
    );
  } else if (characters.length === 0) {
    body = (
      <div className="card stack">
        <h2>还没有角色</h2>
        <p>没有角色就没法新建对话。请先到角色库新建一个角色，或者导入本站导出的角色文件。</p>
        <button type="button" className="btn btn-primary btn-block" onClick={() => navigate('/characters')}>
          去角色库
        </button>
      </div>
    );
  } else {
    body = (
      <ul className="list" role="list" aria-label="选一个角色">
        {characters.map(({ character, count }) => (
          <li key={character.id}>
            <button
              type="button"
              className="chat-card new-chat-card"
              disabled={busyId !== null}
              onClick={() => start(character)}
              aria-label={`和${character.name}新开一个对话，现在有 ${count} 个对话`}
            >
              <Avatar character={character} />
              <span className="chat-main">
                <span className="chat-name">{character.name}</span>
                <span className="chat-preview">{busyId === character.id ? '正在新建……' : `现在有 ${count} 个对话`}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <Screen title="新建对话" subtitle="选一个角色，为它新开一个对话。" backTo="/chats" backLabel="返回聊天列表">
      {body}
    </Screen>
  );
}