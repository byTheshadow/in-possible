// 数据库骨架：Dexie（IndexedDB），独立库名，与 WHEN I with U 的数据互不相通。
//
// 约定：
// 1. 只在 stores() 里写需要查询的索引字段；其余字段直接存在记录里，不建索引，
//    这样以后加字段不用升级数据库版本，旧数据也不会被破坏。读取时每个新字段都要有默认值。
// 2. 需要新表时，新增一个 db.version(n+1).stores({...})，只写新增或改动的表。
// 3. 提醒、待办、日程的表在阶段 3 加入，这一版不建。
//
// 角色记录（characters）的字段，不建索引的都标在这里，方便查：
//   name            姓名（建索引）
//   avatar          头像
//   bio             详细人设
//   extraNotes      补充细节
//   worldBookIds    世界书挂载情况（第一版只存字段，不做界面）
//   knowledgeIds    知识库挂载情况（第一版只存字段，不做界面）
//   voiceProfile    MiniMax 语音类设置（第一版只存字段，不做界面）
//   updatedAt       最近修改时间（建索引）

import Dexie from 'dexie';

export const db = new Dexie('InPossibleDatabase');

db.version(1).stores({
  // 键值设置：accessibilitySettings、apiConfig 等
  settings: 'key',
  characters: '++id, name, updatedAt',
  chats: '++id, characterId, updatedAt',
  messages: '++id, chatId, timestamp',
});

export const getSetting = async (key, fallback = null) => {
  const record = await db.settings.get(key);
  return record && record.value !== undefined ? record.value : fallback;
};

export const setSetting = async (key, value) => {
  await db.settings.put({ key, value });
};

export default db;
