import { useEffect, useState } from 'react';
import ErrorBoundary from './components/ErrorBoundary';
import { announce } from './services/announcer';
import {
  FONT_SCALE_OPTIONS,
  THEME_OPTIONS,
  getAccessibilitySettings,
  subscribeAccessibility,
  updateAccessibilitySettings,
} from './services/accessibilityService';
import { getSetting, setSetting } from './services/db';

// 临时的“地基检查”页：用来在真机上验证主题、字号、焦点环、播报、错误隔离、数据库。
// 阶段 1 做页面骨架时会被聊天列表等真正的页面替换。

function useAccessibility() {
  const [settings, setSettings] = useState(getAccessibilitySettings());
  useEffect(() => subscribeAccessibility(setSettings), []);
  return settings;
}

function Bomb({ explode }) {
  if (explode) throw new Error('这是一次测试用的故意崩溃');
  return <p className="muted">这一块目前正常。</p>;
}

export default function App() {
  const settings = useAccessibility();
  const [explode, setExplode] = useState(false);

  const change = async (patch, message) => {
    try {
      await updateAccessibilitySettings(patch);
      announce(message);
    } catch (error) {
      announce(`保存失败：${error?.message || '未知错误'}。刚才的改动本次可用，但下次打开可能丢失。`, { assertive: true });
    }
  };

  const checkDatabase = async () => {
    try {
      const stamp = String(Date.now());
      await setSetting('selfCheck', stamp);
      const back = await getSetting('selfCheck');
      if (back === stamp) announce('数据库读写正常');
      else announce('数据库读出的内容和写入的不一致', { assertive: true });
    } catch (error) {
      announce(`数据库出错：${error?.message || '未知错误'}`, { assertive: true });
    }
  };

  return (
    <main className="stack" style={{ padding: '1.25rem', maxWidth: 640, margin: '0 auto' }}>
      <header>
        <p style={{ fontWeight: 800 }}>in-possible</p>
        <h1>零极限</h1>
        <p className="muted">地基检查页。这一页只用来在手机上验证基础功能。</p>
      </header>

      <section className="card stack" aria-labelledby="sec-theme">
        <h2 id="sec-theme">配色</h2>
        <div className="row">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className="btn"
              aria-pressed={settings.theme === option.id}
              onClick={() => change({ theme: option.id }, `已切换到${option.label}配色`)}
            >
              {option.label}
              {settings.theme === option.id && <span aria-hidden="true">（当前）</span>}
            </button>
          ))}
        </div>
      </section>

      <section className="card stack" aria-labelledby="sec-font">
        <h2 id="sec-font">字号</h2>
        <div className="row">
          {FONT_SCALE_OPTIONS.map((option) => (
            <button
              key={option.scale}
              type="button"
              className="btn"
              aria-pressed={settings.fontScale === option.scale}
              onClick={() => change({ fontScale: option.scale }, `字号已设为${option.label}，${option.hint}`)}
            >
              {option.label} {option.hint}
              {settings.fontScale === option.scale && <span aria-hidden="true">（当前）</span>}
            </button>
          ))}
        </div>
      </section>

      <section className="card stack" aria-labelledby="sec-touch">
        <h2 id="sec-touch">按钮和单手</h2>
        <div className="row">
          <button
            type="button"
            className="btn"
            aria-pressed={settings.largeButtons}
            onClick={() =>
              change({ largeButtons: !settings.largeButtons }, settings.largeButtons ? '已关闭大按钮' : '已开启大按钮')
            }
          >
            大按钮{settings.largeButtons ? '：开' : '：关'}
          </button>
          <button
            type="button"
            className="btn"
            aria-pressed={settings.oneHand}
            onClick={() =>
              change({ oneHand: !settings.oneHand }, settings.oneHand ? '已关闭单手模式' : '已开启单手模式')
            }
          >
            单手模式{settings.oneHand ? '：开' : '：关'}
          </button>
        </div>
        <p className="muted">单手模式这一版只保存开关，布局要到阶段 1 的页面骨架里才会生效。</p>
      </section>

      <section className="card stack" aria-labelledby="sec-announce">
        <h2 id="sec-announce">播报测试</h2>
        <div className="row">
          <button type="button" className="btn btn-primary" onClick={() => announce('这是一条普通播报')}>
            普通播报
          </button>
          <button
            type="button"
            className="btn btn-accent"
            onClick={() => announce('这是一条紧急播报，应该立刻读出', { assertive: true })}
          >
            紧急播报
          </button>
        </div>
      </section>

      <section className="card stack" aria-labelledby="sec-db">
        <h2 id="sec-db">数据库自检</h2>
        <button type="button" className="btn btn-primary btn-block" onClick={checkDatabase}>
          测试读写
        </button>
      </section>

      <section className="card stack" aria-labelledby="sec-crash">
        <h2 id="sec-crash">错误隔离测试</h2>
        <ErrorBoundary label="崩溃测试区">
          <Bomb explode={explode} />
        </ErrorBoundary>
        <button type="button" className="btn btn-block" onClick={() => setExplode(true)}>
          让这一块崩溃
        </button>
        <button type="button" className="btn btn-block" onClick={() => setExplode(false)}>
          恢复这一块
        </button>
      </section>
    </main>
  );
}
