// src/services/accessibilityService.js
// 无障碍设置：主题、字号、大按钮、单手模式、提示音开关。
//
// 存储：db.settings 里 key = 'accessibilitySettings' 的一条记录。
// 同时在 localStorage 放一份缓存（key = 'ip_a11y_cache'），index.html 里的内联脚本会
// 在页面渲染前读它，避免先闪一下默认样式。加载完成后以数据库为准。
//
// 生效方式：只改 <html> 上的属性和 CSS 变量，样式都在 src/styles 里。

import { getSetting, setSetting } from './db';

export const ACCESSIBILITY_SETTINGS_KEY = 'accessibilitySettings';
export const CACHE_KEY = 'ip_a11y_cache';

export const THEME_OPTIONS = [
  { id: 'light', label: '浅色' },
  { id: 'dark', label: '深色' },
];

export const FONT_SCALE_OPTIONS = [
  { scale: 1, label: '标准', hint: '100%' },
  { scale: 1.25, label: '大', hint: '125%' },
  { scale: 1.5, label: '特大', hint: '150%' },
  { scale: 2, label: '超大', hint: '200%' },
];

export const DEFAULT_ACCESSIBILITY_SETTINGS = {
  theme: 'light',
  fontScale: 1.25,
  largeButtons: false,
  oneHand: false,
  soundEnabled: true,
};

const THEME_COLORS = { light: '#F5F0E8', dark: '#151012' };
const ALLOWED_SCALES = FONT_SCALE_OPTIONS.map((option) => option.scale);

export const normalizeAccessibilitySettings = (raw) => {
  const theme = raw?.theme === 'dark' || raw?.theme === 'light' ? raw.theme : DEFAULT_ACCESSIBILITY_SETTINGS.theme;
  const scale = Number(raw?.fontScale);
  return {
    theme,
    fontScale: ALLOWED_SCALES.includes(scale) ? scale : DEFAULT_ACCESSIBILITY_SETTINGS.fontScale,
    largeButtons: raw?.largeButtons === true,
    oneHand: raw?.oneHand === true,
    soundEnabled: raw?.soundEnabled !== false,
  };
};

export const applyAccessibilitySettings = (settings) => {
  if (typeof document === 'undefined') return;
  const next = normalizeAccessibilitySettings(settings);
  const root = document.documentElement;

  root.setAttribute('data-theme', next.theme);
  root.style.setProperty('--font-scale', String(next.fontScale));

  if (next.largeButtons) root.setAttribute('data-large-buttons', 'true');
  else root.removeAttribute('data-large-buttons');

  if (next.oneHand) root.setAttribute('data-one-hand', 'true');
  else root.removeAttribute('data-one-hand');

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLORS[next.theme]);
};

const writeCache = (settings) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(settings));
  } catch (e) {
    // 缓存写不进去不影响功能，下次打开多闪一帧而已
  }
};

let current = { ...DEFAULT_ACCESSIBILITY_SETTINGS };
const listeners = new Set();

export const getAccessibilitySettings = () => current;

export const subscribeAccessibility = (callback) => {
  listeners.add(callback);
  return () => listeners.delete(callback);
};

const emit = () => listeners.forEach((callback) => callback(current));

// 启动时调用一次（main.jsx）。数据库读失败时继续用默认值，并把错误抛给调用方去播报。
export const initAccessibility = async () => {
  try {
    const stored = await getSetting(ACCESSIBILITY_SETTINGS_KEY, null);
    current = normalizeAccessibilitySettings(stored);
  } catch (error) {
    current = { ...DEFAULT_ACCESSIBILITY_SETTINGS };
    applyAccessibilitySettings(current);
    emit();
    throw error;
  }
  applyAccessibilitySettings(current);
  writeCache(current);
  emit();
};

// 修改并保存。先生效再写库：用户马上看到变化；写库失败时抛出错误，由界面播报。
export const updateAccessibilitySettings = async (patch) => {
  current = normalizeAccessibilitySettings({ ...current, ...patch });
  applyAccessibilitySettings(current);
  writeCache(current);
  emit();
  await setSetting(ACCESSIBILITY_SETTINGS_KEY, current);
  return current;
};