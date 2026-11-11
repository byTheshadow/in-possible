// src/services/soundService.js
//
// 提示音和震动。声音用浏览器合成的短音，不依赖音频文件；
// 四种提示音音高和节奏都不同，可以靠耳朵区分：
//   success 两声上扬   error 两声下沉的低音   receive 两声轻快的高音   tap 一声短促的点
//
// 震动只在支持的设备上有效（安卓可以，iOS 的 PWA 不支持），所以声音和播报才是主要手段。
// 浏览器要求先有用户操作才能出声，所以第一次调用一般在点按之后，没有问题。

import { getAccessibilitySettings } from './accessibilityService';

const TONES = {
  success: { notes: [[660, 0.09], [880, 0.13]], vibrate: [30] },
  error: { notes: [[260, 0.18], [196, 0.26]], vibrate: [70, 40, 70] },
  receive: { notes: [[784, 0.08], [988, 0.11]], vibrate: [20] },
  tap: { notes: [[520, 0.05]], vibrate: [10] },
};

let audioContext = null;

const getContext = () => {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioContext) audioContext = new AudioContextClass();
  if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
  return audioContext;
};

export const SOUND_NAMES = Object.keys(TONES);

export const playSound = (name = 'tap') => {
  const tone = TONES[name];
  if (!tone) return;
  if (!getAccessibilitySettings().soundEnabled) return;

  try {
    const context = getContext();
    if (context) {
      let start = context.currentTime;
      tone.notes.forEach(([frequency, duration]) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.25, start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + duration + 0.02);
        start += duration + 0.03;
      });
    }
  } catch (error) {
    // 声音出不来不影响功能，播报和界面文字仍然会告诉用户发生了什么
  }

  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(tone.vibrate);
    }
  } catch (error) {
    // 同上
  }
};