// src/services/router.js
//
// 极简 hash 路由：地址形如 #/apps、#/settings/accessibility、#/soon?name=聊天&from=/apps
// 不依赖路由库；支持安卓系统返回键；刷新停留在当前页；在 GitHub Pages 上不会 404。
//
// 屏幕里的“返回”按钮一律跳到明确的上级页面（backTo），不用浏览器历史，
// 这样读屏用户每次点返回都知道会去哪里。

import { useSyncExternalStore } from 'react';

const readHash = () => window.location.hash.replace(/^#/, '');

const subscribe = (callback) => {
  window.addEventListener('hashchange', callback);
  return () => window.removeEventListener('hashchange', callback);
};

export const useRoute = () => {
  const raw = useSyncExternalStore(subscribe, readHash, () => '');
  const [path, search = ''] = raw.split('?');
  return { raw, path, query: new URLSearchParams(search) };
};

export const navigate = (target, { replace = false } = {}) => {
  if (replace) window.location.replace(`#${target}`);
  else window.location.hash = target;
};

export const hasHash = () => readHash() !== '';

// “还在建设中”页面的地址。from 是点返回时回到的页面，只允许站内路径。
export const soonPath = (name, from = '/apps') =>
  `/soon?name=${encodeURIComponent(name)}&from=${encodeURIComponent(from)}`;

export const safeFrom = (from) => (typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') ? from : '/apps');