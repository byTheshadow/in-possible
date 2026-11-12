// src/components/Avatar.jsx

// 头像：圆形。有图片（character.avatar 是 data:image/ 开头的地址）就显示图片，
// 没有就取名字第一个字，颜色由 id 在四个分类色（粉、紫、黄、薄荷）里轮换。
// 角色和用户共用这个组件：用户头像传 { id, name, avatar } 即可。
// 圆、圆角方块、六边形、拱形现在只用于应用分类，不再用于头像。
// 头像纯装饰，读屏忽略，名字由旁边的文字读出。
// size：xl、lg、md、xs（xs 的样式在 chatroom.css，xl 在 chat.css）。

const COLOR_COUNT = 4;

export const avatarIndex = (character) => Math.abs(Number(character?.id) || 0) % COLOR_COUNT;

export const hasAvatarImage = (character) => typeof character?.avatar === 'string' && character.avatar.startsWith('data:image/');

export default function Avatar({ character, size = 'lg' }) {
  const index = avatarIndex(character);
  const initial = Array.from(character?.name || '?')[0];
  return (
    <span aria-hidden="true" className={`avatar avatar-${size} avatar-circle avatar-k${index + 1}`}>
      {hasAvatarImage(character) ? <img className="avatar-img" src={character.avatar} alt="" draggable={false} /> : initial}
    </span>
  );
}