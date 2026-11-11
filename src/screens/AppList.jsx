// src/screens/AppList.jsx
import Screen from '../components/Screen';
import { soonPath } from '../services/router';
import { playSound } from '../services/soundService';

// 应用列表（主界面）：杂志式大方块。之后应用增多都放这里。
// 还没做的应用先指向“还在建设中”页面，如实告诉用户，不假装能用。
const TILES = [
  { title: '聊天', desc: '和角色说话', color: 'tile-k1', wide: true, to: '/chats' },
  { title: '日历', desc: '提醒、日程、待办、健康', color: 'tile-k2', to: soonPath('日历', '/apps') },
  { title: '待办', desc: '记下要做的事', color: 'tile-k3', to: soonPath('待办', '/apps') },
  { title: '提醒', desc: '吃药、喝水、起床', color: 'tile-k4', to: soonPath('提醒', '/apps') },
  { title: '说明书', desc: '再看一遍怎么用', color: 'tile-accent', to: soonPath('说明书', '/apps') },
  { title: '设置', desc: '配色、字号、AI 接入', color: 'tile-plain', to: '/settings' },
];

export default function AppList() {
  return (
    <Screen title="应用列表">
      <nav aria-label="全部应用">
        <div className="tile-grid">
          {TILES.map((tile) => (
            <a
              key={tile.title}
              href={`#${tile.to}`}
              className={`tile ${tile.color}${tile.wide ? ' tile-wide' : ''}`}
              onClick={() => playSound('tap')}
            >
              <span className="tile-title">{tile.title}</span>
              <span className="tile-desc">{tile.desc}</span>
            </a>
          ))}
        </div>
      </nav>
    </Screen>
  );
}