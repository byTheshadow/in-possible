// src/services/bubbleStyle.js
//
// 气泡颜色（包 2c-2）。每个聊天各自保存两份：角色的气泡、我的气泡。
// chats 记录里的 bubbleStyle：{ character: { preset, bg, fg }, user: { preset, bg, fg } }
//   preset  ''（默认，沿用原来的颜色）| 'pink' | 'purple' | 'yellow' | 'mint' | 'custom'
//   bg      底色，#rrggbb。preset 是 custom 时才用；其余时候只是自定义框里预填的值
//   fg      字色，#rrggbb。同上
// 四个预设色就是应用的四个分类色，字用近黑色，对比度都远高于 4.5 比 1。

export const BUBBLE_PRESETS = [
  { id: 'pink', label: '粉', bg: '#f7b4ce', fg: '#1d1618' },
  { id: 'purple', label: '紫', bg: '#c9b9ff', fg: '#1d1618' },
  { id: 'yellow', label: '黄', bg: '#ffc94d', fg: '#1d1618' },
  { id: 'mint', label: '薄荷', bg: '#8edcb8', fg: '#1d1618' },
];

export const MIN_CONTRAST = 4.5;

export const DEFAULT_BUBBLE = { preset: '', bg: '#f7b4ce', fg: '#1d1618' };

export const DEFAULT_BUBBLE_STYLE = {
  character: { ...DEFAULT_BUBBLE },
  user: { ...DEFAULT_BUBBLE },
};

// 接受 #rgb、#rrggbb，前面的 # 可以省；不是颜色返回 null
export const normalizeHex = (value) => {
  const text = String(value ?? '').trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(text)) {
    return `#${text
      .split('')
      .map((c) => c + c)
      .join('')
      .toLowerCase()}`;
  }
  if (/^[0-9a-fA-F]{6}$/.test(text)) return `#${text.toLowerCase()}`;
  return null;
};

const channel = (value) => {
  const v = value / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

const luminance = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
};

// 两个 #rrggbb 之间的对比度（1 到 21）；任何一个不是颜色返回 null
export const contrastRatio = (a, b) => {
  const first = normalizeHex(a);
  const second = normalizeHex(b);
  if (!first || !second) return null;
  const la = luminance(first);
  const lb = luminance(second);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

// 补全并清理一边的设置（来自数据库的旧数据可能缺字段或有坏值）
export const normalizeBubble = (value) => {
  const source = value && typeof value === 'object' ? value : {};
  const known = ['', 'custom', ...BUBBLE_PRESETS.map((p) => p.id)];
  return {
    preset: known.includes(source.preset) ? source.preset : '',
    bg: normalizeHex(source.bg) || DEFAULT_BUBBLE.bg,
    fg: normalizeHex(source.fg) || DEFAULT_BUBBLE.fg,
  };
};

export const normalizeBubbleStyle = (value) => ({
  character: normalizeBubble(value?.character),
  user: normalizeBubble(value?.user),
});

// 这一边实际要用的底色和字色；默认（preset 为空）返回 null，表示沿用原来的样式
export const bubbleColors = (value) => {
  const bubble = normalizeBubble(value);
  if (bubble.preset === '') return null;
  if (bubble.preset === 'custom') return { bg: bubble.bg, fg: bubble.fg };
  const preset = BUBBLE_PRESETS.find((p) => p.id === bubble.preset);
  return preset ? { bg: preset.bg, fg: preset.fg } : null;
};

// 给气泡元素用的内联样式；默认返回 undefined
export const bubbleInlineStyle = (value) => {
  const colors = bubbleColors(value);
  return colors ? { background: colors.bg, color: colors.fg } : undefined;
};