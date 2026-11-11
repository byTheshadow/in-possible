// src/screens/Welcome.jsx
import Screen from '../components/Screen';
import { announce } from '../services/announcer';
import { navigate } from '../services/router';
import { setSetting } from '../services/db';
import { playSound } from '../services/soundService';

// 首次使用说明。三条要点，每条粗体一行，解释另起一行。
// 注意：设置角色和连接 AI 的流程在下一轮做，这一版点“知道了”先进入应用列表。
const POINTS = [
  { title: '和角色说话', desc: '想做什么，直接说，或者打字。' },
  { title: '角色帮你记着', desc: '吃药、日程、待办，说一句就记下，到时提醒你。' },
  { title: '每一步都会告诉你', desc: '设置了什么、出了什么问题，都会读出来。' },
];

export default function Welcome() {
  const start = async () => {
    playSound('tap');
    try {
      await setSetting('welcomeSeen', true);
    } catch (error) {
      announce(`保存失败：${error?.message || '未知错误'}。下次打开还会再显示这页说明。`, { assertive: true });
      playSound('error');
    }
    // 用替换而不是新增历史记录，这样按返回键不会回到首次说明
    navigate('/apps', { replace: true });
  };

  return (
    <Screen
      title="零极限"
      docTitle="首次使用说明"
      subtitle="在可能性之内"
      hero
      leading={<div className="hero-ring" aria-hidden="true" />}
      actions={
        <button type="button" className="btn btn-primary btn-block" style={{ minHeight: 'calc(var(--tap) * 1.4)', fontSize: '1.3rem' }} onClick={start}>
          知道了，开始设置
        </button>
      }
    >
      <h2>第一次使用，先看这三件事</h2>
      <ol className="steps" role="list">
        {POINTS.map((point, index) => (
          <li key={point.title} className="card step">
            <div className="step-num" aria-hidden="true">{index + 1}</div>
            <div>
              <p className="step-title">{point.title}</p>
              <p className="step-desc">{point.desc}</p>
            </div>
          </li>
        ))}
      </ol>
    </Screen>
  );
}