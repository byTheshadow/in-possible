// src/components/Avatar.jsx
import { useEffect, useState } from 'react';
import { getImageUrl } from '../services/imageService';

// 头像：圆形。有图片就显示图片，没有就取名字第一个字，颜色由 id 在四个分类色（粉、紫、黄、薄荷）里轮换。
// 图片有三种来源，按这个顺序找：
//   character.avatar 是 blob: 或 data:image/ 开头的地址（设置页里刚选好还没保存的预览，以及旧版本存的 data 地址）
//   character.avatarImageId 是 images 表里的图片 id（正式存的图片，规矩见 imageService.js）
//   都没有就用名字的第一个字
// 角色和用户共用这个组件：用户头像传 { id, name, avatar, avatarImageId } 即可。
// 圆、圆角方块、六边形、拱形现在只用于应用分类，不再用于头像。
// 头像纯装饰，读屏忽略，名字由旁边的文字读出。
// size：xl、lg、md、xs（xs 的样式在 chatroom.css，xl 在 chat.css）。

const COLOR_COUNT = 4;

export const avatarIndex = (character) => Math.abs(Number(character?.id) || 0) % COLOR_COUNT;

const isDirectSource = (value) => typeof value === 'string' && (value.startsWith('data:image/') || value.startsWith('blob:'));

// 按图片 id 取显示地址；取不到（图片已被删）就返回 null，调用方退回名字首字
const useStoredImage = (imageId) => {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let alive = true;
    if (imageId === null || imageId === undefined) {
      setUrl(null);
      return undefined;
    }
    getImageUrl(imageId)
      .then((result) => {
        if (alive) setUrl(result);
      })
      .catch(() => {
        if (alive) setUrl(null);
      });
    return () => {
      alive = false;
    };
  }, [imageId]);
  return url;
};

export default function Avatar({ character, size = 'lg' }) {
  const index = avatarIndex(character);
  const initial = Array.from(character?.name || '?')[0];
  const direct = isDirectSource(character?.avatar) ? character.avatar : null;
  const stored = useStoredImage(direct ? null : character?.avatarImageId);
  const source = direct || stored;
  return (
    <span aria-hidden="true" className={`avatar avatar-${size} avatar-circle avatar-k${index + 1}`}>
      {source ? <img className="avatar-img" src={source} alt="" draggable={false} /> : initial}
    </span>
  );
}