// src/screens/AccessibilitySettings.jsx
import { useEffect, useState } from 'react';
import ChoiceButton from '../components/ChoiceButton';
import Screen from '../components/Screen';
import { announce } from '../services/announcer';
import {
  FONT_SCALE_OPTIONS,
  THEME_OPTIONS,
  getAccessibilitySettings,
  subscribeAccessibility,
  updateAccessibilitySettings,
} from '../services/accessibilityService';
import { navigate } from '../services/router';
import { playSound } from '../services/soundService';

function useAccessibility() {
  const [settings, setSettings] = useState(getAccessibilitySettings());
  useEffect(() => subscribeAccessibility(setSettings), []);
  return settings;
}

export default function AccessibilitySettings() {
  const settings = useAccessibility();

  // 改动先生效，再写入数据库；写入失败要出声告诉用户，不能默默丢掉
  const change = async (patch, message) => {
    try {
      await updateAccessibilitySettings(patch);
      announce(message);
      playSound('success');
    } catch (error) {
      announce(`保存失败：${error?.message || '未知错误'}。刚才的改动这次可用，但下次打开可能丢失。`, { assertive: true });
      playSound('error');
    }
  };

  return (
    <Screen title="无障碍设置" backTo="/settings" backLabel="返回设置">
      <section className="card stack" aria-labelledby="a11y-theme">
        <h2 id="a11y-theme">配色</h2>
        <div className="row">
          {THEME_OPTIONS.map((option) => (
            <ChoiceButton
              key={option.id}
              selected={settings.theme === option.id}
              onClick={() => change({ theme: option.id }, `已切换到${option.label}配色`)}
            >
              {option.label}
            </ChoiceButton>
          ))}
        </div>
      </section>

      <section className="card stack" aria-labelledby="a11y-font">
        <h2 id="a11y-font">字号</h2>
        <div className="row">
          {FONT_SCALE_OPTIONS.map((option) => (
            <ChoiceButton
              key={option.scale}
              selected={settings.fontScale === option.scale}
              onClick={() => change({ fontScale: option.scale }, `字号已设为${option.label}，${option.hint}`)}
            >
              {option.label} {option.hint}
            </ChoiceButton>
          ))}
        </div>
      </section>

      <section className="card stack" aria-labelledby="a11y-touch">
        <h2 id="a11y-touch">按钮和单手</h2>
        <div className="row">
          <ChoiceButton
            selected={settings.largeButtons}
            onClick={() => change({ largeButtons: !settings.largeButtons }, settings.largeButtons ? '已关闭大按钮' : '已开启大按钮')}
          >
            大按钮{settings.largeButtons ? '：开' : '：关'}
          </ChoiceButton>
          <ChoiceButton
            selected={settings.oneHand}
            onClick={() => change({ oneHand: !settings.oneHand }, settings.oneHand ? '已关闭单手模式，按钮跟着内容走' : '已开启单手模式，内容靠下，按钮固定在底部')}
          >
            单手模式{settings.oneHand ? '：开' : '：关'}
          </ChoiceButton>
        </div>
        <p className="muted">单手模式开启后，内容整体靠下排列，返回和确认按钮固定在屏幕底部。</p>
      </section>

      <section className="card stack" aria-labelledby="a11y-sound">
        <h2 id="a11y-sound">提示音和震动</h2>
        <div className="row">
          <ChoiceButton
            selected={settings.soundEnabled}
            onClick={() => change({ soundEnabled: !settings.soundEnabled }, settings.soundEnabled ? '已关闭提示音和震动' : '已开启提示音和震动')}
          >
            提示音{settings.soundEnabled ? '：开' : '：关'}
          </ChoiceButton>
          <button type="button" className="btn" onClick={() => { playSound('success'); announce('已播放成功提示音'); }}>
            试听成功音
          </button>
          <button type="button" className="btn" onClick={() => { playSound('error'); announce('已播放错误提示音'); }}>
            试听错误音
          </button>
        </div>
        <p className="muted">震动只在安卓上有效，iPhone 不支持。所以每个操作都有声音或语音播报，不会只靠震动。</p>
      </section>

      <section className="card stack" aria-labelledby="a11y-dev">
        <h2 id="a11y-dev">开发检查</h2>
        <button type="button" className="btn btn-block" onClick={() => navigate('/settings/diagnostics')}>
          打开诊断页
        </button>
      </section>
    </Screen>
  );
}