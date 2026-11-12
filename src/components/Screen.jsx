// src/components/Screen.jsx
import { useEffect, useRef } from 'react';
import { navigate } from '../services/router';

// 每个页面的统一外壳：
// - 进入页面时把焦点放到页面标题上，读屏会立刻读出“当前是哪一屏”。
// - 返回按钮放在屏幕下半部，永远回到明确的上级页面（backTo）。
// - 开启单手模式后，内容整体靠下，操作按钮固定在屏幕底部（样式见 layout.css）。
// - fixed：整页高度等于屏幕，顶部标题区和底部操作区固定不动，只有中间的内容区自己滚动（聊天室用）。
//   手机弹出键盘时，页面高度跟着可见区域变化，顶部和底部仍然都在屏幕里。
export default function Screen({ title, docTitle, subtitle, leading, hero = false, fixed = false, backTo, backLabel = '返回', actions, children }) {
  const headingRef = useRef(null);

  useEffect(() => {
    document.title = `${docTitle || title} - 零极限`;
    if (headingRef.current) headingRef.current.focus();
  }, [title, docTitle]);

  useEffect(() => {
    if (!fixed) return undefined;
    const viewport = window.visualViewport;
    if (!viewport) return undefined;
    const root = document.documentElement;
    const apply = () => {
      root.style.setProperty('--app-h', `${viewport.height}px`);
      // 有的浏览器弹键盘时会把整页顶上去，拉回来
      if (window.scrollY !== 0) window.scrollTo(0, 0);
    };
    apply();
    viewport.addEventListener('resize', apply);
    viewport.addEventListener('scroll', apply);
    return () => {
      viewport.removeEventListener('resize', apply);
      viewport.removeEventListener('scroll', apply);
      root.style.removeProperty('--app-h');
    };
  }, [fixed]);

  return (
    <div className={fixed ? 'screen screen-fixed' : 'screen'}>
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