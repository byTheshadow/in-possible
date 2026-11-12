// src/screens/AiSettings.jsx
import { useEffect, useRef, useState } from 'react';
import Screen from '../components/Screen';
import { announce } from '../services/announcer';
import {
  clearApiConfig,
  fetchModels,
  getApiConfig,
  isApiConfigured,
  normalizeBaseUrl,
  saveApiConfig,
} from '../services/aiService';
import { safeFrom, useRoute } from '../services/router';
import { playSound } from '../services/soundService';
import '../styles/forms.css';

// AI 接入：接口地址、密钥、模型（从列表里选，不手输）。
// 从聊天室跳过来时，地址带 from，返回按钮回到那个聊天室。

export default function AiSettings() {
  const { query } = useRoute();
  const from = safeFrom(query.get('from') || '/settings');
  const backLabel = from.startsWith('/chat') ? '返回聊天' : '返回设置';

  const [loaded, setLoaded] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [models, setModels] = useState([]);
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [saved, setSaved] = useState(false);

  const urlRef = useRef(null);
  const keyRef = useRef(null);
  const modelRef = useRef(null);

  useEffect(() => {
    let alive = true;
    getApiConfig()
      .then((config) => {
        if (!alive) return;
        setBaseUrl(config.baseUrl);
        setApiKey(config.apiKey);
        setModel(config.model);
        setModels(config.model ? [config.model] : []);
        setSaved(isApiConfigured(config));
        setLoaded(true);
      })
      .catch((error) => {
        if (!alive) return;
        setLoaded(true);
        const text = `读取 AI 接入设置失败：${error?.message || '未知错误'}`;
        setNote(text);
        announce(text, { assertive: true });
        playSound('error');
      });
    return () => {
      alive = false;
    };
  }, []);

  const say = (text, { assertive = false, sound } = {}) => {
    setNote(text);
    announce(text, { assertive });
    if (sound) playSound(sound);
  };

  // 地址或密钥改了，之前拉到的模型列表就不可信了：只留下已选的那一个
  const onUrlChange = (event) => {
    setBaseUrl(event.target.value);
    setModels(model ? [model] : []);
    setSaved(false);
  };
  const onKeyChange = (event) => {
    setApiKey(event.target.value);
    setModels(model ? [model] : []);
    setSaved(false);
  };

  const toggleKey = () => {
    const next = !showKey;
    setShowKey(next);
    announce(next ? '密钥已显示' : '密钥已隐藏');
    playSound('tap');
  };

  const checkInputs = ({ needModel }) => {
    const url = normalizeBaseUrl(baseUrl);
    if (!url) {
      say('还没填接口地址', { assertive: true, sound: 'error' });
      urlRef.current?.focus();
      return null;
    }
    if (!/^https?:\/\//i.test(url)) {
      say('接口地址要以 http:// 或 https:// 开头', { assertive: true, sound: 'error' });
      urlRef.current?.focus();
      return null;
    }
    if (!apiKey.trim()) {
      say('还没填密钥', { assertive: true, sound: 'error' });
      keyRef.current?.focus();
      return null;
    }
    if (needModel && !model) {
      say('还没选模型。先点“拉取模型列表”，再从列表里选一个', { assertive: true, sound: 'error' });
      return null;
    }
    return { baseUrl: url, apiKey: apiKey.trim(), model };
  };

  const loadModels = async () => {
    const config = checkInputs({ needModel: false });
    if (!config || busy) return;
    setBusy('models');
    say('正在拉取模型列表……');
    try {
      const ids = await fetchModels({ baseUrl: config.baseUrl, apiKey: config.apiKey });
      setModels(ids);
      say(`拉取到 ${ids.length} 个模型。请在“模型”里选一个。`, { sound: 'success' });
      modelRef.current?.focus();
    } catch (error) {
      say(`拉取模型失败：${error?.message || '未知错误'}`, { assertive: true, sound: 'error' });
    } finally {
      setBusy('');
    }
  };

  const save = async () => {
    const config = checkInputs({ needModel: true });
    if (!config || busy) return;
    setBusy('save');
    try {
      await saveApiConfig(config);
      setBaseUrl(config.baseUrl);
      setSaved(true);
      say('已保存。AI 接入设好了，可以回聊天室点“让 TA 回复”。', { sound: 'success' });
    } catch (error) {
      say(`保存失败：${error?.message || '未知错误'}。这次关掉页面后设置会丢失。`, { assertive: true, sound: 'error' });
    } finally {
      setBusy('');
    }
  };

  // 清除要点两下：第一下只改按钮文字并紧急播报，第二下才执行
  const clearAll = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      announce('再点一次“确认清除”，会删掉这台设备上保存的接口地址、密钥和模型', { assertive: true });
      return;
    }
    setConfirmClear(false);
    try {
      await clearApiConfig();
      setBaseUrl('');
      setApiKey('');
      setModel('');
      setModels([]);
      setSaved(false);
      say('已清除 AI 接入设置', { sound: 'success' });
    } catch (error) {
      say(`清除失败：${error?.message || '未知错误'}`, { assertive: true, sound: 'error' });
    }
  };

  const modelOptions = model && !models.includes(model) ? [model, ...models] : models;

  return (
    <Screen title="AI 接入" subtitle={saved ? '状态：已设好' : '状态：还没设好'} backTo={from} backLabel={backLabel}>
      {!loaded ? (
        <p className="muted" role="status">
          正在读取……
        </p>
      ) : (
        <>
          <section className="card stack" aria-labelledby="ai-howto">
            <h2 id="ai-howto">怎么填</h2>
            <p>需要三样东西：接口地址、密钥、模型。它们由你自己用的 AI 服务提供，应该写在服务的帮助页或账户页里。</p>
            <p className="muted">
              接口地址一般以 /v1 结尾，例如 https://api.openai.com/v1。填好地址和密钥后，点“拉取模型列表”，再从列表里选一个模型，最后点“保存”。
            </p>
            <p className="muted">
              密钥只保存在这台设备的浏览器里，不会交给我们，也不会写进日志。聊天时，请求直接从你的浏览器发到你填的地址。有些服务不允许网页直接访问，那样会提示连不上。
            </p>
          </section>

          <section className="card stack" aria-labelledby="ai-form">
            <h2 id="ai-form">填写</h2>

            <div className="field">
              <label htmlFor="ai-url">接口地址</label>
              <input
                id="ai-url"
                ref={urlRef}
                className="field-input"
                type="text"
                inputMode="url"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="https://api.openai.com/v1"
                value={baseUrl}
                onChange={onUrlChange}
              />
            </div>

            <div className="field">
              <label htmlFor="ai-key">密钥</label>
              <input
                id="ai-key"
                ref={keyRef}
                className="field-input"
                type={showKey ? 'text' : 'password'}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                value={apiKey}
                onChange={onKeyChange}
              />
              <button type="button" className="btn btn-block" onClick={toggleKey}>
                {showKey ? '隐藏密钥' : '显示密钥'}
              </button>
            </div>

            <button type="button" className="btn btn-accent btn-block" onClick={loadModels} disabled={busy !== ''}>
              {busy === 'models' ? '正在拉取……' : '拉取模型列表'}
            </button>

            <div className="field">
              <label htmlFor="ai-model">模型</label>
              <select
                id="ai-model"
                ref={modelRef}
                className="field-input"
                value={model}
                onChange={(event) => {
                  setModel(event.target.value);
                  setSaved(false);
                }}
              >
                <option value="">{modelOptions.length > 0 ? '请选择模型' : '先拉取模型列表'}</option>
                {modelOptions.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </select>
            </div>

            <button type="button" className="btn btn-primary btn-block" onClick={save} disabled={busy !== ''}>
              {busy === 'save' ? '正在保存……' : '保存'}
            </button>

            {note && <p className="field-note">{note}</p>}
          </section>

          <section className="card stack" aria-labelledby="ai-clear">
            <h2 id="ai-clear">清除</h2>
            <p className="muted">删掉这台设备上保存的接口地址、密钥和模型。聊天记录不受影响。</p>
            <button type="button" className="btn btn-block" onClick={clearAll}>
              {confirmClear ? '确认清除' : '清除 AI 接入设置'}
            </button>
          </section>
        </>
      )}
    </Screen>
  );
}