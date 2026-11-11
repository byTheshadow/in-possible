// src/components/Avatar.jsx

// 角色头像：现在只有占位——取名字第一个字，形状和颜色由角色 id 决定
// （圆、圆角方块、六边形、拱形，配四个分类色），不改角色字段。
// 将来角色有自己的头像图片时，在这里加判断。
// 头像纯装饰，读屏忽略，名字由旁边的文字读出。

const SHAPES = ['circle', 'round', 'hex', 'arch'];

export const avatarIndex = (character) => Math.abs(Number(character?.id) || 0) % SHAPES.length;

export default function Avatar({ character, size = 'lg' }) {
  const index = avatarIndex(character);
  const initial = Array.from(character?.name || '?')[0];
  return (
    <span aria-hidden="true" className={`avatar avatar-${size} avatar-${SHAPES[index]} avatar-k${index + 1}`}>
      {initial}
    </span>
  );
}