// src/services/messageService.js
//
// 聊天室的消息读写。
//
// messages 记录（只有 chatId、timestamp 建了索引，其余字段直接存，不升级数据库版本）：
//   chatId        所属聊天的 id
//   role          'user' | 'character' | 'system'
//   text          正文（角色的消息：当前显示的那一条）
//   timestamp     毫秒时间戳
//   quoteOfId     引用的消息 id，没有引用时是 null（旧消息没有这个字段，读取时按 null 处理）
//   variants      角色消息重新生成后保留的所有回复（文字数组）。旧消息没有，读取时按 [text]
//   variantIndex  当前显示的是第几条（从 0 开始）。旧消息没有，读取时取最后一条
//
// chats 记录在 chatService.js 里已有 characterId、updatedAt、lastMessage、unread。
// 聊天设置新字段（userProfile、systemPrompt、reactionGuide、keepAlive、typingStyle）
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

const withMessageDefaults = (row) => {
  const variants = Array.isArray(row.variants) && row.variants.length > 0 ? row.variants : [row.text];
  const index = Number.isInteger(row.variantIndex) ? row.variantIndex : variants.length - 1;
  const variantIndex = Math.min(Math.max(index, 0), variants.length - 1);
  return { ...row, quoteOfId: row.quoteOfId ?? null, variants, variantIndex };
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
  return rows.map(withMessageDefaults);
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
    return withMessageDefaults({ ...message, id });
  });

// 存一条角色的回复。用户正在聊天室里，所以不增加未读。
export const addCharacterMessage = ({ chatId, text }) =>
  db.transaction('rw', db.chats, db.messages, async () => {
    const timestamp = Date.now();
    const message = { chatId: Number(chatId), role: 'character', text, timestamp, quoteOfId: null, variants: [text], variantIndex: 0 };
    const id = await db.messages.add(message);
    await db.chats.update(Number(chatId), {
      updatedAt: timestamp,
      lastMessage: { role: 'character', text, timestamp },
    });
    return withMessageDefaults({ ...message, id });
  });

// 聊天列表的预览要跟着最新一条消息走
const refreshLastMessage = async (chatId, patch = {}) => {
  const rows = await db.messages.where('chatId').equals(Number(chatId)).sortBy('timestamp');
  const last = rows[rows.length - 1];
  await db.chats.update(Number(chatId), {
    ...patch,
    lastMessage: last ? { role: last.role, text: last.text, timestamp: last.timestamp } : null,
  });
};

// 重新生成：旧回复保留，新回复加到最后并设为当前显示的那一条（做法 B）
export const addVariant = ({ chatId, messageId, text }) =>
  db.transaction('rw', db.chats, db.messages, async () => {
    const row = await db.messages.get(Number(messageId));
    if (!row) throw new Error('要重新生成的那条消息已经不在了');
    const current = withMessageDefaults(row);
    const variants = [...current.variants, text];
    await db.messages.update(row.id, { text, variants, variantIndex: variants.length - 1 });
    await refreshLastMessage(chatId, { updatedAt: Date.now() });
    return withMessageDefaults({ ...row, text, variants, variantIndex: variants.length - 1 });
  });

// 在已有的回复之间切换显示
export const setVariantIndex = ({ chatId, messageId, index }) =>
  db.transaction('rw', db.chats, db.messages, async () => {
    const row = await db.messages.get(Number(messageId));
    if (!row) throw new Error('这条消息已经不在了');
    const current = withMessageDefaults(row);
    if (index < 0 || index >= current.variants.length) throw new Error('没有这一条回复');
    const text = current.variants[index];
    await db.messages.update(row.id, { text, variants: current.variants, variantIndex: index });
    await refreshLastMessage(chatId);
    return withMessageDefaults({ ...row, text, variants: current.variants, variantIndex: index });
  });

// 进入聊天室后把未读清零
export const markChatRead = (chatId) => db.chats.update(Number(chatId), { unread: 0 });