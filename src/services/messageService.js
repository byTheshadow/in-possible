// src/services/messageService.js
//
// 聊天室的消息读写。
//
// messages 记录（只有 chatId、timestamp 建了索引，其余字段直接存，不升级数据库版本）：
//   chatId      所属聊天的 id
//   role        'user' | 'character' | 'system'
//   text        正文
//   timestamp   毫秒时间戳
//   quoteOfId   引用的消息 id，没有引用时是 null（旧消息没有这个字段，读取时按 null 处理）
//
// chats 记录在 chatService.js 里已有 characterId、updatedAt、lastMessage、unread。
// 这个包新增的聊天设置字段（userProfile、systemPrompt、reactionGuide、keepAlive、typingStyle）
// 只在这里给出默认值，聊天设置页（包 2c）才会真正写入它们。

import db from './db';
import { getCharacter, getOrCreateChat } from './chatService';

export const CHAT_DEFAULTS = {
  userProfile: { avatar: '', name: '', persona: '', inputHint: '' },
  systemPrompt: '',
  reactionGuide: '',
  keepAlive: false,
  typingStyle: 'dots',
};

// 旧记录没有新字段时补上默认值
export const withChatDefaults = (chat) => {
  if (!chat) return null;
  return {
    ...CHAT_DEFAULTS,
    ...chat,
    userProfile: { ...CHAT_DEFAULTS.userProfile, ...(chat.userProfile || {}) },
    unread: Number(chat.unread) || 0,
  };
};

const toKey = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && value !== null && value !== '' ? number : null;
};

// 打开聊天室：地址里可以是聊天 id（?id=），也可以是角色 id（?c=）。
// 只给角色 id 时，用这个角色的第一个聊天，没有就新建一个。
// 找不到返回 null。
export const resolveChat = async ({ chatId, characterId }) => {
  const chatKey = toKey(chatId);
  if (chatKey !== null) return withChatDefaults(await db.chats.get(chatKey));

  const characterKey = toKey(characterId);
  if (characterKey !== null) {
    const character = await getCharacter(characterKey);
    if (!character) return null;
    return withChatDefaults(await getOrCreateChat(characterKey));
  }
  return null;
};

export const listMessages = async (chatId) => {
  const rows = await db.messages.where('chatId').equals(Number(chatId)).sortBy('timestamp');
  return rows.map((row) => ({ ...row, quoteOfId: row.quoteOfId ?? null }));
};

// 存一条用户消息，并更新聊天的最近消息和时间。
export const addUserMessage = ({ chatId, text, quoteOfId = null }) =>
  db.transaction('rw', db.chats, db.messages, async () => {
    const timestamp = Date.now();
    const message = { chatId: Number(chatId), role: 'user', text, timestamp, quoteOfId };
    const id = await db.messages.add(message);
    await db.chats.update(Number(chatId), {
      updatedAt: timestamp,
      lastMessage: { role: 'user', text, timestamp },
    });
    return { ...message, id };
  });

// 进入聊天室后把未读清零
export const markChatRead = (chatId) => db.chats.update(Number(chatId), { unread: 0 });