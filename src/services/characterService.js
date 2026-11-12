// src/services/characterService.js
//
// 角色库的数据读写（包 2d）：列表、新建、修改、删除、导出、导入。
// 角色记录的字段见 db.js。头像按图片规矩走 images 表（imageService.js），记录里只放 avatarImageId：
//   换图、移除图、删除角色时，旧图一起删，不留垃圾。
// 文件格式和改名规则在 characterFormat.js（纯数据，能单独测试）。
// 聊天列表和新建对话里用的 chatService.js 不改。

import db from './db';
import { assignNames, cleanName, clipText, EXPORT_FORMAT, EXPORT_VERSION, IMPORT_MAX_BYTES, parseImportText, TEXT_MAX } from './characterFormat';
import { dataUrlToBlob, deleteImage, fileToAvatarBlob, saveImage } from './imageService';

export { NAME_MAX, TEXT_MAX, exportFileName } from './characterFormat';

// 读取时每个字段都补默认值（旧记录、示例数据可能没有）
export const withCharacterDefaults = (row) => ({
  ...row,
  name: typeof row?.name === 'string' ? row.name : '',
  avatar: typeof row?.avatar === 'string' ? row.avatar : '',
  avatarImageId: row?.avatarImageId ?? null,
  bio: typeof row?.bio === 'string' ? row.bio : '',
  extraNotes: typeof row?.extraNotes === 'string' ? row.extraNotes : '',
  worldBookIds: Array.isArray(row?.worldBookIds) ? row.worldBookIds : [],
  knowledgeIds: Array.isArray(row?.knowledgeIds) ? row.knowledgeIds : [],
  voiceProfile: row?.voiceProfile ?? null,
  updatedAt: Number(row?.updatedAt) || 0,
});

// 角色库列表：按创建先后排，顺序稳定（读屏用户每次进来位置不变）。chatCount 是这个角色现在有几个对话。
export const listLibrary = async () => {
  const [characters, chats] = await Promise.all([db.characters.toArray(), db.chats.toArray()]);
  const counts = new Map();
  chats.forEach((chat) => counts.set(chat.characterId, (counts.get(chat.characterId) || 0) + 1));
  return characters
    .slice()
    .sort((a, b) => a.id - b.id)
    .map((row) => ({ character: withCharacterDefaults(row), chatCount: counts.get(row.id) || 0 }));
};

export const getLibraryCharacter = async (characterId) => {
  const row = await db.characters.get(Number(characterId));
  return row ? withCharacterDefaults(row) : null;
};

// 删除前告诉用户会连带删掉多少：{ chats: 对话数, messages: 消息条数 }
export const getFootprint = async (characterId) => {
  const id = Number(characterId);
  const chats = await db.chats.where('characterId').equals(id).toArray();
  let messages = 0;
  for (const chat of chats) {
    messages += await db.messages.where('chatId').equals(chat.id).count();
  }
  return { chats: chats.length, messages };
};

const checkedFields = ({ name, bio, extraNotes }) => {
  const finalName = cleanName(name);
  if (!finalName) throw new Error('名字不能是空的');
  return { name: finalName, bio: clipText(bio, TEXT_MAX), extraNotes: clipText(extraNotes, TEXT_MAX) };
};

// 新建角色。avatarBlob 是已经处理好的头像（可以没有）。返回新角色的 id。
export const createCharacter = async ({ name, bio = '', extraNotes = '', avatarBlob = null }) => {
  const fields = checkedFields({ name, bio, extraNotes });
  let imageId = null;
  try {
    if (avatarBlob) imageId = await saveImage(avatarBlob, 'avatar');
    return await db.characters.add({
      ...fields,
      avatar: '',
      avatarImageId: imageId,
      worldBookIds: [],
      knowledgeIds: [],
      voiceProfile: null,
      updatedAt: Date.now(),
    });
  } catch (error) {
    // 图片存了但角色没建成：把图删掉，不留垃圾
    if (imageId !== null) await deleteImage(imageId).catch(() => {});
    throw error;
  }
};

// 修改角色。avatarBlob：换成这张新图；removeAvatar：去掉头像；都没有就不动头像。
export const updateCharacter = async (characterId, { name, bio = '', extraNotes = '', avatarBlob = null, removeAvatar = false }) => {
  const id = Number(characterId);
  const fields = checkedFields({ name, bio, extraNotes });
  const row = await db.characters.get(id);
  if (!row) throw new Error('这个角色已经不在了');

  const oldImageId = row.avatarImageId ?? null;
  let newImageId = null;
  const patch = { ...fields, updatedAt: Date.now() };
  try {
    if (avatarBlob) {
      newImageId = await saveImage(avatarBlob, 'avatar');
      patch.avatarImageId = newImageId;
      patch.avatar = '';
    } else if (removeAvatar) {
      patch.avatarImageId = null;
      patch.avatar = '';
    }
    await db.characters.update(id, patch);
  } catch (error) {
    if (newImageId !== null) await deleteImage(newImageId).catch(() => {});
    throw error;
  }
  if (oldImageId !== null && (newImageId !== null || removeAvatar)) {
    await deleteImage(oldImageId).catch(() => {});
  }
  return withCharacterDefaults(await db.characters.get(id));
};

// 删除角色：连同它所有的对话、消息、角色头像、我在这些对话里用的头像一起删。返回 { chats, messages }。
// 这是整个应用里破坏性最大的操作，界面上要点两下并说清楚会删多少。
export const deleteCharacter = async (characterId) => {
  const id = Number(characterId);
  const imageIds = new Set();
  let chatCount = 0;
  let messageCount = 0;
  await db.transaction('rw', db.characters, db.chats, db.messages, async () => {
    const row = await db.characters.get(id);
    if (!row) throw new Error('这个角色已经不在了');
    if (row.avatarImageId !== null && row.avatarImageId !== undefined) imageIds.add(Number(row.avatarImageId));
    const chats = await db.chats.where('characterId').equals(id).toArray();
    for (const chat of chats) {
      const userImage = chat?.userProfile?.avatarImageId;
      if (userImage !== null && userImage !== undefined) imageIds.add(Number(userImage));
      messageCount += await db.messages.where('chatId').equals(chat.id).delete();
    }
    chatCount = chats.length;
    await db.chats.where('characterId').equals(id).delete();
    await db.characters.delete(id);
  });
  for (const imageId of imageIds) {
    try {
      await deleteImage(imageId);
    } catch (error) {
      // 删不掉的图片留给诊断页的“清理没用到的图片”
    }
  }
  return { chats: chatCount, messages: messageCount };
};

// ---------- 导出 ----------

const blobToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('读不出头像图片'));
    reader.readAsDataURL(blob);
  });

// 整理出要写进文件的内容（已保存的版本，不含页面上没保存的修改）
export const buildExportData = async (characterId) => {
  const row = await db.characters.get(Number(characterId));
  if (!row) throw new Error('这个角色已经不在了');
  const character = withCharacterDefaults(row);
  let avatar = null;
  if (character.avatarImageId !== null) {
    const image = await db.images.get(Number(character.avatarImageId));
    if (image && image.blob instanceof Blob) avatar = await blobToDataUrl(image.blob);
  } else if (character.avatar.startsWith('data:image/')) {
    avatar = character.avatar;
  }
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    characters: [{ name: character.name, bio: character.bio, extraNotes: character.extraNotes, avatar }],
  };
};

// 让浏览器下载这份内容。成功只代表“已经交给浏览器”，文件最后存在哪由系统决定。
export const downloadJson = (data, fileName) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 30000);
};

// ---------- 导入 ----------

// 第一步：读文件、检查、定好每个角色的最终名字。这一步不写数据库，用户确认后才调用 importCharacters。
// 返回 { fileName, plan, skipped, truncated, badAvatars }，plan 里每项有 name、finalName、renamed、bio、extraNotes、avatar。
export const prepareImport = async (file) => {
  if (!file) throw new Error('没有选到文件');
  if (file.size > IMPORT_MAX_BYTES) throw new Error('这个文件太大了（超过 10 MB），不像是角色文件');
  let text;
  try {
    text = await file.text();
  } catch (error) {
    throw new Error('这个文件读不出来，请重新选一次');
  }
  const parsed = parseImportText(text);
  const names = (await db.characters.toArray()).map((row) => row.name);
  return {
    fileName: file.name || '角色文件',
    plan: assignNames(parsed.items, names),
    skipped: parsed.skipped,
    truncated: parsed.truncated,
    badAvatars: parsed.badAvatars,
  };
};

// 第二步：真正写入。每个角色单独处理，一个失败不影响其他的。
// 返回 { created: [{ id, name, renamed }], failed: [{ name, message }], avatarFailed }。
export const importCharacters = async (plan) => {
  const created = [];
  const failed = [];
  let avatarFailed = 0;
  for (const item of plan) {
    let avatarBlob = null;
    if (item.avatar) {
      try {
        // 重新裁成 256 像素的正方形，保证导入的图也符合图片规矩
        avatarBlob = await fileToAvatarBlob(await dataUrlToBlob(item.avatar));
      } catch (error) {
        avatarFailed += 1;
      }
    }
    try {
      const id = await createCharacter({ name: item.finalName, bio: item.bio, extraNotes: item.extraNotes, avatarBlob });
      created.push({ id, name: item.finalName, renamed: item.renamed });
    } catch (error) {
      failed.push({ name: item.finalName, message: error?.message || '未知错误' });
    }
  }
  return { created, failed, avatarFailed };
};