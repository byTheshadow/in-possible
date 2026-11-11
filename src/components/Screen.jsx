// src/components/Screen.jsx
import { useEffect, useRef } from 'react';
import { navigate } from '../services/router';

// 每个页面的统一外壳：
// - 进入页面时把焦点放到页面标题上，读屏会立刻读出“当前是哪一屏”。
// - 返回按钮放在屏幕下半部，永远回到明确的上级页面（backTo）。
// - 开启单手模式后，内容整体靠下，操作按钮固定在屏幕底部（样式见 layout.css）。
export default function Screen({ title, docTitle, subtitle, leading, hero = false, backTo, backLabel = '返回', actions, children }) {
  const headingRef = useRef(null);

  useEffect(() => {
    document.title = `${docTitle || title} - 零极限`;
    if (headingRef.current) headingRef.current.focus();
  }, [title, docTitle]);

  return (
    <div className="screen">
      <header className="screen-header">
        <p className="brand">in-possible</p>
        <div className="screen-title-row">
          {leading}
          <div>
            <h1 ref={headingRef} tabIndex={-1} className={hero ? 'hero-title' : undefined}>
              {title}
            </h1>
            {subtitle && <p className={hero ? 'hero-subtitle' : 'muted'}>{subtitle}</p>}
          </div>
        </div>
      </header>

      <main className="screen-body">{children}</main>

      {(actions || backTo) && (
        <div className="screen-actions">
          {actions}
          {backTo && (
            <button type="button" className="btn btn-block" onClick={() => navigate(backTo)}>
              {backLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}