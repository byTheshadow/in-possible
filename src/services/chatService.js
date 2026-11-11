// src/services/chatService.js
//
// 角色和聊天的数据读写。每个角色对应一个聊天（chats 表里一条记录）。
//
// chats 记录（只有 characterId、updatedAt 建了索引，其余字段直接存，不升级数据库版本）：
//   characterId   角色 id
//   updatedAt     最近一条消息的时间，聊天列表按它倒序
//   lastMessage   { role, text, timestamp } 或 null，列表预览用
//   unread        未读条数。规则：角色发来的消息加 1，进入聊天室清零
// 读取时每个字段都要有默认值（旧记录可能没有）。
//
// 消息的读写在 messageService.js（下一个包加入）。

import db from './db';

const newCharacter = (name, now) => ({
  name,
  avatar: '',
  bio: '',
  extraNotes: '',
  worldBookIds: [],
  knowledgeIds: [],
  voiceProfile: null,
  updatedAt: now,
});

export const getCharacter = (characterId) => db.characters.get(Number(characterId));

// 聊天列表用的摘要：每个角色一行，按最近消息时间倒序
export const listChatSummaries = async () => {
  const [characters, chats] = await Promise.all([db.characters.toArray(), db.chats.toArray()]);
  const chatByCharacter = new Map();
  chats.forEach((chat) => {
    if (!chatByCharacter.has(chat.characterId)) chatByCharacter.set(chat.characterId, chat);
  });

  const rows = characters.map((character) => {
    const chat = chatByCharacter.get(character.id) || null;
    return {
      character,
      chat,
      unread: Number(chat?.unread) || 0,
      lastMessage: chat?.lastMessage || null,
      sortAt: chat?.updatedAt || character.updatedAt || 0,
    };
  });
  rows.sort((a, b) => b.sortAt - a.sortAt);
  return rows;
};

// 没有聊天记录就建一条
export const getOrCreateChat = (characterId) =>
  db.transaction('rw', db.chats, async () => {
    const id = Number(characterId);
    const existing = await db.chats.where('characterId').equals(id).first();
    if (existing) return existing;
    const chat = { characterId: id, updatedAt: Date.now(), lastMessage: null, unread: 0 };
    const chatId = await db.chats.add(chat);
    return { ...chat, id: chatId };
  });

// ---------- 开发用：示例数据（诊断页的按钮调用，正式发布前可以去掉） ----------

const buildSamples = (now) => {
  const startOfToday = new Date(new Date(now).setHours(0, 0, 0, 0)).getTime();
  const hour = 3600 * 1000;
  return [
    {
      name: '小岚',
      unread: 2,
      messages: [
        { role: 'character', text: '早上好。', at: now - 120000 },
        { role: 'character', text: '今天感觉怎么样？', at: now - 60000 },
      ],
    },
    {
      name: '阿澈',
      unread: 0,
      messages: [
        { role: 'user', text: '晚安。', at: startOfToday - 2 * hour - 60000 },
        { role: 'character', text: '晚安，明天见。', at: startOfToday - 2 * hour },
      ],
    },
    {
      name: '云舒',
      unread: 0,
      messages: [{ role: 'character', text: '这周的安排我帮你理好了。', at: startOfToday - 3 * 24 * hour + 10 * hour }],
    },
  ];
};

// 已经有角色时不再造，避免把真实数据搞乱
export const seedSampleCharacters = async () => {
  const existing = await db.characters.count();
  if (existing > 0) return { created: 0, existing };

  const now = Date.now();
  const samples = buildSamples(now);
  await db.transaction('rw', db.characters, db.chats, db.messages, async () => {
    for (const sample of samples) {
      const characterId = await db.characters.add(newCharacter(sample.name, now));
      const last = sample.messages[sample.messages.length - 1];
      const chatId = await db.chats.add({
        characterId,
        updatedAt: last.at,
        lastMessage: { role: last.role, text: last.text, timestamp: last.at },
        unread: sample.unread,
      });
      await db.messages.bulkAdd(sample.messages.map((m) => ({ chatId, role: m.role, text: m.text, timestamp: m.at })));
    }
  });
  return { created: samples.length, existing: 0 };
};

// 开发用：清空角色、聊天、消息（不动 settings）
export const clearChatData = () =>
  db.transaction('rw', db.characters, db.chats, db.messages, async () => {
    await db.messages.clear();
    await db.chats.clear();
    await db.characters.clear();
  });