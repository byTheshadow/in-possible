// src/components/Avatar.jsx

// 角色头像：现在只有占位——取名字第一个字。头像一律是圆形，
// 颜色由角色 id 在四个分类色（粉、紫、黄、薄荷）里轮换；不改角色字段。
// 圆、圆角方块、六边形、拱形现在只用于应用分类，不再用于头像。
// 将来角色有自己的头像图片时，在这里加判断。
// 头像纯装饰，读屏忽略，名字由旁边的文字读出。
// size：lg、md、xs（xs 的样式在 chatroom.css）。

const COLOR_COUNT = 4;

export const avatarIndex = (character) => Math.abs(Number(character?.id) || 0) % COLOR_COUNT;

export default function Avatar({ character, size = 'lg' }) {
  const index = avatarIndex(character);
  const initial = Array.from(character?.name || '?')[0];
  return (
    <span aria-hidden="true" className={`avatar avatar-${size} avatar-circle avatar-k${index + 1}`}>
      {initial}
    </span>
  );
}