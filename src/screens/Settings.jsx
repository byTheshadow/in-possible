// src/screens/Settings.jsx
import Screen from '../components/Screen';
import { soonPath } from '../services/router';
import { playSound } from '../services/soundService';

// 设置：分组列表。目前只有“无障碍”是真的，其余指向“还在建设中”。
const ITEMS = [
  { title: '角色', desc: '名字、头像、人设', to: soonPath('角色', '/settings') },
  { title: 'AI 接入', desc: '接口地址、密钥、模型', to: soonPath('AI 接入', '/settings') },
  { title: '视觉识别', desc: '看图用的接口', to: soonPath('视觉识别', '/settings') },
  { title: '通知与陪伴', desc: '通知开关、提示音、主动消息频率', to: soonPath('通知与陪伴', '/settings') },
  { title: '无障碍', desc: '配色、字号、大按钮、单手模式', to: '/settings/accessibility' },
  { title: '数据备份', desc: '导出和导入', to: soonPath('数据备份', '/settings') },
  { title: '说明书', desc: '再看一遍怎么用', to: soonPath('说明书', '/settings') },
];

export default function Settings() {
  return (
    <Screen title="设置" backTo="/apps" backLabel="返回应用列表">
      <nav aria-label="设置分组">
        <ul className="list" role="list">
          {ITEMS.map((item) => (
            <li key={item.title}>
              <a href={`#${item.to}`} className="list-link" onClick={() => playSound('tap')}>
                <span>
                  <span className="list-link-title">{item.title}</span>
                  <br />
                  <span className="list-link-desc">{item.desc}</span>
                </span>
                <span className="list-link-go" aria-hidden="true">进入</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </Screen>
  );
}