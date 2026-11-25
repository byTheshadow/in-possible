// src/services/chatService.js
//
// 角色和聊天的数据读写。每个角色可以有多个对话（chats 表里每个对话一条记录）。
//
// chats 记录（只有 characterId、updatedAt 建了索引，其余字段直接存，不升级数据库版本）：
//   characterId   角色 id（同一个角色可以有多条记录，就是多个对话）
//   updatedAt     最近一条消息的时间，聊天列表按它倒序
//   lastMessage   { role, text, timestamp } 或 null，列表预览用
//   unread        未读条数。规则：角色发来的消息加 1，进入聊天室清零
// 读取时每个字段都要有默认值（旧记录可能没有）。
//
// 消息的读写在 messageService.js（下一个包加入）。

import db from './db';

export const getCharacter = (characterId) => db.characters.get(Number(characterId));

// 聊天列表用的摘要：每个对话一行，按最近消息时间倒序。
// 还没有任何对话的角色也占一行（chat 为 null），点进去会为它建第一个对话。
// dialogName：自己起了名字就用它，没有就按同一个角色的对话顺序叫“对话 1、对话 2……”。
export const listChatSummaries = async () => {
  const [characters, chats] = await Promise.all([db.characters.toArray(), db.chats.toArray()]);
  const chatsByCharacter = new Map();
  chats
    .slice()
    .sort((a, b) => a.id - b.id)
    .forEach((chat) => {
      if (!chatsByCharacter.has(chat.characterId)) chatsByCharacter.set(chat.characterId, []);
      chatsByCharacter.get(chat.characterId).push(chat);
    });

  const rows = [];
  characters.forEach((character) => {
    const own = chatsByCharacter.get(character.id) || [];
    if (own.length === 0) {
      rows.push({
        key: `c${character.id}`,
        character,
        chat: null,
        dialogName: '',
        unread: 0,
        lastMessage: null,
        sortAt: character.updatedAt || 0,
      });
      return;
    }
    own.forEach((chat, index) => {
      const custom = typeof chat.name === 'string' ? chat.name.trim() : '';
      rows.push({
        key: `k${chat.id}`,
        character,
        chat,
        dialogName: custom || `对话 ${index + 1}`,
        unread: Number(chat.unread) || 0,
        lastMessage: chat.lastMessage || null,
        sortAt: chat.updatedAt || character.updatedAt || 0,
      });
    });
  });
  rows.sort((a, b) => b.sortAt - a.sortAt);
  return rows;
};

// 某个角色现在有几个对话
export const countChats = (characterId) => db.chats.where('characterId').equals(Number(characterId)).count();

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

// 为角色新开一个对话（不管已经有几个）。返回新对话的记录。
export const createChat = async (characterId) => {
  const id = Number(characterId);
  const character = await db.characters.get(id);
  if (!character) throw new Error('这个角色已经不在了');
  const chat = { characterId: id, updatedAt: Date.now(), lastMessage: null, unread: 0 };
  const chatId = await db.chats.add(chat);
  return { ...chat, id: chatId };
};

// 开发用：清空角色、聊天、消息和图片（不动 settings）
export const clearChatData = () =>
  db.transaction('rw', db.characters, db.chats, db.messages, db.images, async () => {
    await db.images.clear();
    await db.messages.clear();
    await db.chats.clear();
    await db.characters.clear();
  });
