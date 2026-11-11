// 读屏播报：整个应用只用这一个入口。
//
// announce('已设置', { assertive: true })
//   - 默认礼貌播报（等读屏读完手头的再读）。
//   - assertive 用于错误和必须马上知道的事（API 报错、保存失败）。
//
// 实际的实时区域由 components/Announcer.jsx 渲染。每次播报前先清空再写入，
// 这样连续两次播报同一句话，读屏也会再读一遍。
//
// 注意：流式输出时不要逐字调用这里，等一句或整段完成后再播报一次。

const listeners = new Set();

export const subscribeAnnouncements = (callback) => {
  listeners.add(callback);
  return () => listeners.delete(callback);
};

export const announce = (message, { assertive = false } = {}) => {
  const text = String(message ?? '').trim();
  if (!text) return;
  listeners.forEach((callback) => callback({ text, assertive }));
};
