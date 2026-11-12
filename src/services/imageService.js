// src/services/imageService.js
//
// 头像图片：用户从相册选一张图，裁成正方形、缩到 256 像素、压成 JPEG 的 data 地址，
// 直接存在记录里（用户头像存在聊天记录的 userProfile.avatar，角色头像存在角色的 avatar）。
// 这样不用另建表，图也不会大到拖慢数据库。
// 失败时抛出带中文原因的 Error，由调用方播报。

export const AVATAR_SIZE = 256;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const JPEG_QUALITY = 0.85;

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

// 把用户选的图片文件变成头像用的 data 地址
export const fileToAvatarData = async (file, size = AVATAR_SIZE) => {
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

  const data = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  if (!data.startsWith('data:image/')) throw new Error('图片处理失败，请换一张再试');
  return data;
};