// src/services/imageService.js
//
// 图片的统一入口。规矩（以后所有带图片的功能都照这个来）：
// 1. 图片不直接塞进聊天、角色、消息的记录里，一律存在单独的 images 表（db.js 的版本 2），
//    记录里只放图片 id。这样读聊天列表、读消息时不会顺带把一大堆图片读进内存。
// 2. 存之前一律缩小：头像裁成正方形、边长 256 像素、压成 JPEG（质量 0.8），一张通常 10 到 25 KB。
// 3. 谁用图片谁负责清理：换图、移除图、删除聊天或角色时，把不用的图片一起删掉。
//    万一漏了，诊断页有“清理没用到的图片”可以扫一遍。
// 4. 显示用 getImageUrl（带缓存的 blob 地址），不要每次都重新读。
//
// images 记录：{ id, blob, type, size, kind, createdAt }

import db from './db';

export const AVATAR_SIZE = 256;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const JPEG_QUALITY = 0.8;

// ---------- 把用户选的图片文件处理成头像用的 Blob ----------

const loadWithImageElement = (file) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('这张图片打不开，可能格式不支持。请换一张 JPG 或 PNG 图片'));
    };
    image.src = url;
  });

const loadImage = async (file) => {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch (error) {
      // 有些浏览器对个别格式不支持，退回用图片元素再试一次
    }
  }
  return loadWithImageElement(file);
};

const canvasToBlob = (canvas) =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('图片处理失败，请换一张再试'))),
      'image/jpeg',
      JPEG_QUALITY
    );
  });

export const fileToAvatarBlob = async (file, size = AVATAR_SIZE) => {
  if (!file) throw new Error('没有选到图片');
  if (!String(file.type).startsWith('image/')) throw new Error('选的不是图片文件');
  if (file.size > MAX_FILE_BYTES) throw new Error('这张图片太大了（超过 20 MB），请换一张小一点的');

  const source = await loadImage(file);
  const width = source.width || source.naturalWidth;
  const height = source.height || source.naturalHeight;
  if (!width || !height) throw new Error('读不出这张图片的大小，请换一张');

  const side = Math.min(width, height);
  const sx = Math.floor((width - side) / 2);
  const sy = Math.floor((height - side) / 2);

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('这个浏览器不能处理图片');
  // 先铺白底，避免透明的 PNG 压成 JPEG 后变黑
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, size, size);
  context.drawImage(source, sx, sy, side, side, 0, 0, size, size);
  if (typeof source.close === 'function') source.close();

  return canvasToBlob(canvas);
};

// ---------- images 表的读写 ----------

const urlCache = new Map(); // 图片 id -> blob 地址（整个页面生命周期内复用）

export const saveImage = async (blob, kind = 'avatar') => {
  if (!(blob instanceof Blob)) throw new Error('要存的不是图片');
  return db.images.add({ blob, type: blob.type, size: blob.size, kind, createdAt: Date.now() });
};

export const deleteImage = async (imageId) => {
  if (imageId === null || imageId === undefined) return;
  const url = urlCache.get(imageId);
  if (url) {
    URL.revokeObjectURL(url);
    urlCache.delete(imageId);
  }
  await db.images.delete(Number(imageId));
};

// 图片 id -> 可以放进 img 的地址；找不到返回 null
export const getImageUrl = async (imageId) => {
  if (imageId === null || imageId === undefined) return null;
  if (urlCache.has(imageId)) return urlCache.get(imageId);
  const row = await db.images.get(Number(imageId));
  if (!row || !(row.blob instanceof Blob)) return null;
  const existing = urlCache.get(imageId);
  if (existing) return existing; // 读的过程中别处已经建好了
  const url = URL.createObjectURL(row.blob);
  urlCache.set(imageId, url);
  return url;
};

// 旧版本（包 2c-1）把头像直接存成 data 地址放在记录里，这里把它转成 Blob
export const dataUrlToBlob = async (dataUrl) => {
  const response = await fetch(dataUrl);
  return response.blob();
};

// ---------- 存储用量和清理 ----------

// 哪些图片还有人在用：聊天的用户头像、角色的头像
const collectUsedImageIds = async () => {
  const used = new Set();
  const [chats, characters] = await Promise.all([db.chats.toArray(), db.characters.toArray()]);
  chats.forEach((chat) => {
    const id = chat?.userProfile?.avatarImageId;
    if (id !== null && id !== undefined) used.add(Number(id));
  });
  characters.forEach((character) => {
    const id = character?.avatarImageId;
    if (id !== null && id !== undefined) used.add(Number(id));
  });
  return used;
};

// 删掉没人用的图片，返回 { removed, bytes }
export const purgeOrphanImages = async () => {
  const used = await collectUsedImageIds();
  const rows = await db.images.toArray();
  const orphans = rows.filter((row) => !used.has(row.id));
  for (const row of orphans) {
    await deleteImage(row.id);
  }
  return { removed: orphans.length, bytes: orphans.reduce((sum, row) => sum + (row.size || 0), 0) };
};

export const formatBytes = (bytes) => {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} 字节`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

// 诊断页用：图片张数和大小、整个网站的用量和上限、是否已申请持久存储
export const getStorageReport = async () => {
  const rows = await db.images.toArray();
  const used = await collectUsedImageIds();
  const report = {
    imageCount: rows.length,
    imageBytes: rows.reduce((sum, row) => sum + (row.size || 0), 0),
    orphanCount: rows.filter((row) => !used.has(row.id)).length,
    usage: null,
    quota: null,
    persisted: null,
  };
  if (navigator.storage && typeof navigator.storage.estimate === 'function') {
    try {
      const estimate = await navigator.storage.estimate();
      report.usage = estimate.usage ?? null;
      report.quota = estimate.quota ?? null;
    } catch (error) {
      // 估算不出来就留空
    }
  }
  if (navigator.storage && typeof navigator.storage.persisted === 'function') {
    try {
      report.persisted = await navigator.storage.persisted();
    } catch (error) {
      // 同上
    }
  }
  return report;
};

// 申请“持久存储”，让浏览器在空间紧张时不要自动清掉这个网站的数据。返回 true、false 或 null（不支持）
export const requestPersistentStorage = async () => {
  if (!navigator.storage || typeof navigator.storage.persist !== 'function') return null;
  try {
    return await navigator.storage.persist();
  } catch (error) {
    return false;
  }
};