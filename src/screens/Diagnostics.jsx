// src/screens/Diagnostics.jsx
import { useState } from 'react';
import ErrorBoundary from '../components/ErrorBoundary';
import Screen from '../components/Screen';
import { announce } from '../services/announcer';
import { clearChatData, seedSampleCharacters } from '../services/chatService';
import { getSetting, setSetting } from '../services/db';
import { playSound } from '../services/soundService';

// 开发用诊断页：在真机上验证播报、数据库、错误隔离。正式发布前可以隐藏。

function Bomb({ explode }) {
  if (explode) throw new Error('这是一次测试用的故意崩溃');
  return <p className="muted">这一块目前正常。</p>;
}

export default function Diagnostics() {
  const [explode, setExplode] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const checkDatabase = async () => {
    try {
      const stamp = String(Date.now());
      await setSetting('selfCheck', stamp);
      const back = await getSetting('selfCheck');
      if (back === stamp) {
        announce('数据库读写正常');
        playSound('success');
      } else {
        announce('数据库读出的内容和写入的不一致', { assertive: true });
        playSound('error');
      }
    } catch (error) {
      announce(`数据库出错：${error?.message || '未知错误'}`, { assertive: true });
      playSound('error');
    }
  };

  const seedSamples = async () => {
    try {
      const { created, existing } = await seedSampleCharacters();
      if (created > 0) {
        announce(`已造好 ${created} 个示例角色`);
        playSound('success');
      } else {
        announce(`已经有 ${existing} 个角色，没有再造。要重新造，请先清空。`);
      }
    } catch (error) {
      announce(`造示例角色失败：${error?.message || '未知错误'}`, { assertive: true });
      playSound('error');
    }
  };

  // 清空要点两下：第一下只改按钮文字并播报，第二下才执行
  const clearAll = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      announce('再点一次“确认清空”，会删掉全部角色、聊天和消息', { assertive: true });
      return;
    }
    setConfirmClear(false);
    try {
      await clearChatData();
      announce('已清空角色、聊天和消息');
      playSound('success');
    } catch (error) {
      announce(`清空失败：${error?.message || '未知错误'}`, { assertive: true });
      playSound('error');
    }
  };

  return (
    <Screen title="诊断页" subtitle="开发用，在手机上验证基础功能。" backTo="/settings/accessibility" backLabel="返回无障碍设置">
      <section className="card stack" aria-labelledby="diag-announce">
        <h2 id="diag-announce">播报测试</h2>
        <div className="row">
          <button type="button" className="btn btn-primary" onClick={() => announce('这是一条普通播报')}>
            普通播报
          </button>
          <button type="button" className="btn btn-accent" onClick={() => announce('这是一条紧急播报，应该立刻读出', { assertive: true })}>
            紧急播报
          </button>
        </div>
      </section>

      <section className="card stack" aria-labelledby="diag-db">
        <h2 id="diag-db">数据库自检</h2>
        <button type="button" className="btn btn-primary btn-block" onClick={checkDatabase}>
          测试读写
        </button>
      </section>

      <section className="card stack" aria-labelledby="diag-chat">
        <h2 id="diag-chat">聊天测试数据</h2>
        <p className="muted">造 3 个示例角色（小岚有 2 条未读），用来验证聊天列表。已经有角色时不会再造。</p>
        <button type="button" className="btn btn-primary btn-block" onClick={seedSamples}>
          造 3 个示例角色
        </button>
        <button type="button" className="btn btn-block" onClick={clearAll}>
          {confirmClear ? '确认清空（再点一次）' : '清空角色和聊天'}
        </button>
      </section>

      <section className="card stack" aria-labelledby="diag-crash">
        <h2 id="diag-crash">错误隔离测试</h2>
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
    </Screen>
  );
}