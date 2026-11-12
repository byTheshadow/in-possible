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
// 聊天设置字段（name、userProfile、systemPrompt、reactionGuide、keepAlive、typingStyle）
// 在这里给出默认值，聊天设置页（包 2c-1）通过 updateChatSettings 写入。
//   name          对话名。空的时候显示“对话 1、对话 2……”（同一个角色的聊天按 id 排名）
//   userProfile   { avatarImageId（images 表里的图片 id，null 是用名字首字）, name, persona, inputHint,
//                   avatar（旧版本存的 data 地址，读聊天时会自动转成图片 id，转完是空）}
//   bubbleStyle   气泡颜色，{ character, user }，每边 { preset, bg, fg }（见 bubbleStyle.js）
//   keepAlive     后台保活开关，现在只存开关，真正的保活到做提醒之前再加

import db from './db';
import { getCharacter, getOrCreateChat } from './chatService';
import { DEFAULT_BUBBLE_STYLE, normalizeBubbleStyle } from './bubbleStyle';
import { dataUrlToBlob, deleteImage, saveImage } from './imageService';

export const TYPING_STYLES = ['dots', 'text', 'wave'];

export const CHAT_DEFAULTS = {
  name: '',
  userProfile: { avatar: '', avatarImageId: null, name: '', persona: '', inputHint: '' },
  systemPrompt: '',
  reactionGuide: '',
  bubbleStyle: DEFAULT_BUBBLE_STYLE,
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
    bubbleStyle: normalizeBubbleStyle(chat.bubbleStyle),
    unread: Number(chat.unread) || 0,
  };
};

const withMessageDefaults = (row) => {
  const variants = Array.isArray(row.variants) && row.variants.length > 0 ? row.variants : [row.text];
  const index = Number.isInteger(row.variantIndex) ? row.variantIndex : variants.length - 1;
  const variantIndex = Math.min(Math.max(index, 0), variants.length - 1);
  return { ...row, quoteOfId: row.quoteOfId ?? null, variants, variantIndex };
};

// 旧版本把头像直接存成 data 地址放在记录里：读到时转成 Blob 存进 images 表，记录里只留图片 id。
// 转换失败不要紧，旧地址还留着，下次再试，头像照样能显示。
const migrateLegacyAvatar = async (chat) => {
  const legacy = chat?.userProfile?.avatar;
  if (typeof legacy !== 'string' || !legacy.startsWith('data:image/')) return chat;
  try {
    const blob = await dataUrlToBlob(legacy);
    const imageId = await saveImage(blob, 'avatar');
    const userProfile = { ...chat.userProfile, avatar: '', avatarImageId: imageId };
    await db.chats.update(chat.id, { userProfile });
    return { ...chat, userProfile };
  } catch (error) {
    return chat;
  }
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
  if (chatKey !== null) {
    const row = withChatDefaults(await db.chats.get(chatKey));
    return row ? withChatDefaults(await migrateLegacyAvatar(row)) : null;
  }

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

// ---------- 包 2c-1：聊天设置 ----------

// 对话名：自己起了名字就用它，没有就按同一个角色的聊天顺序叫“对话 1、对话 2……”
export const getDialogName = async (chat) => {
  const custom = typeof chat?.name === 'string' ? chat.name.trim() : '';
  if (custom) return custom;
  const siblings = await db.chats.where('characterId').equals(Number(chat.characterId)).sortBy('id');
  const rank = siblings.findIndex((row) => row.id === chat.id) + 1;
  return `对话 ${rank > 0 ? rank : 1}`;
};

// 保存聊天设置：只改传进来的字段，别的字段原样保留。返回补过默认值的新记录。
export const updateChatSettings = async (chatId, patch) => {
  const id = Number(chatId);
  const row = await db.chats.get(id);
  if (!row) throw new Error('这个聊天已经不在了');

  const next = {};
  if (patch.userProfile) {
    next.userProfile = { ...CHAT_DEFAULTS.userProfile, ...(row.userProfile || {}), ...patch.userProfile };
  }
  const oldImageId = row.userProfile?.avatarImageId ?? null;
  ['name', 'systemPrompt', 'reactionGuide'].forEach((key) => {
    if (key in patch) next[key] = String(patch[key] ?? '');
  });
  if ('bubbleStyle' in patch) next.bubbleStyle = normalizeBubbleStyle(patch.bubbleStyle);
  if ('typingStyle' in patch) next.typingStyle = TYPING_STYLES.includes(patch.typingStyle) ? patch.typingStyle : 'dots';
  if ('keepAlive' in patch) next.keepAlive = Boolean(patch.keepAlive);

  await db.chats.update(id, next);
  // 换了头像或移除了头像：旧图片没人用了，一起删掉
  const newImageId = next.userProfile ? next.userProfile.avatarImageId ?? null : oldImageId;
  if (oldImageId !== null && oldImageId !== newImageId) {
    try {
      await deleteImage(oldImageId);
    } catch (error) {
      // 删不掉不影响保存；诊断页的“清理没用到的图片”以后能扫掉
    }
  }
  return withChatDefaults({ ...row, ...next });
};

// 清空聊天记录：删掉这个聊天里所有消息（包括重新生成留下的候选），未读清零。聊天本身和设置保留。
export const clearChatMessages = (chatId) =>
  db.transaction('rw', db.chats, db.messages, async () => {
    const id = Number(chatId);
    await db.messages.where('chatId').equals(id).delete();
    await db.chats.update(id, { lastMessage: null, unread: 0 });
  });

// 删除整个对话框：删掉这个聊天和它的所有消息。角色本身保留（角色只在角色库里删）。
export const deleteChat = async (chatId) => {
  const id = Number(chatId);
  const row = await db.chats.get(id);
  await db.transaction('rw', db.chats, db.messages, async () => {
    await db.messages.where('chatId').equals(id).delete();
    await db.chats.delete(id);
  });
  // 这个聊天的用户头像图片也没人用了
  const imageId = row?.userProfile?.avatarImageId ?? null;
  if (imageId !== null) {
    try {
      await deleteImage(imageId);
    } catch (error) {
      // 同上
    }
  }
};