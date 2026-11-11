// src/services/timeFormat.js
//
// 时间显示的统一写法：
//   formatClock     08:02
//   formatListTime  今天显示时分，昨天显示“昨天”，一周内显示周几，更早显示 11月3日

const pad = (value) => String(value).padStart(2, '0');

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

export const formatClock = (timestamp) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const formatListTime = (timestamp, now = Date.now()) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const days = Math.round((startOfDay(new Date(now)) - startOfDay(date)) / 86400000);
  if (days <= 0) return formatClock(timestamp);
  if (days === 1) return '昨天';
  if (days < 7) return WEEK[date.getDay()];
  return `${date.getMonth() + 1}月${date.getDate()}日`;
};