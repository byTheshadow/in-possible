// src/screens/ChatSettings.jsx
import { useEffect, useRef, useState } from 'react';
import Avatar from '../components/Avatar';
import Screen from '../components/Screen';
import { announce } from '../services/announcer';
import { BUBBLE_PRESETS, MIN_CONTRAST, bubbleColors, contrastRatio, normalizeHex } from '../services/bubbleStyle';
import { getCharacter } from '../services/chatService';
import { fileToAvatarBlob, saveImage, deleteImage } from '../services/imageService';
import {
  clearChatMessages,
  deleteChat,
  getDialogName,
  listMessages,
  resolveChat,
  updateChatSettings,
} from '../services/messageService';
import { navigate, useRoute } from '../services/router';
import { playSound } from '../services/soundService';
import '../styles/chat.css';
import '../styles/forms.css';
import '../styles/chatsettings.css';

// 聊天设置页（包 2c-1）。每个聊天各自独立：用户个人信息、本窗提示词、打字指示器、后台保活开关、
// 清空聊天记录、删除整个对话框。地址 /chat/settings?id=聊天id。
// 改动先放在草稿里，点“保存”才写入；有没保存的改动时，点“返回聊天”要再点一次才会放弃。
// 气泡颜色（包 2c-2）：角色的气泡和我的气泡各有 粉、紫、黄、薄荷、自定义；自定义可以改底色和字色，
// 保存前检查对比度，低于 4.5 比 1 会提醒（再点一次才保存）。
// 清空和删除都是点两下：第一下改按钮文字并紧急播报，第二下才执行。

const STYLE_OPTIONS = [
  { value: 'dots', label: '三点跳动', hint: '三个小点轮流跳动' },
  { value: 'text', label: '文字“正在输入”', hint: '只显示文字，没有动画' },
  { value: 'wave', label: '波浪', hint: '几根竖条像波浪一样起伏' },
];

// 头像在草稿里的样子：avatarId 是已经存好的图片 id（或 null），pending 是刚选好、还没保存的图片 Blob。
// 点“保存”时才把 pending 存进 images 表，所以选了又不保存不会在数据库里留下垃圾。
const SIDE_LABEL = { character: '角色的气泡', user: '我的气泡' };

const toDraft = (chat) => ({
  name: chat.name || '',
  userName: chat.userProfile.name || '',
  avatarId: chat.userProfile.avatarImageId ?? null,
  pending: null,
  persona: chat.userProfile.persona || '',
  inputHint: chat.userProfile.inputHint || '',
  systemPrompt: chat.systemPrompt || '',
  reactionGuide: chat.reactionGuide || '',
  typingStyle: chat.typingStyle || 'dots',
  keepAlive: Boolean(chat.keepAlive),
  bubble: { character: { ...chat.bubbleStyle.character }, user: { ...chat.bubbleStyle.user } },
});

const trimmedDraft = (draft) => ({
  ...draft,
  name: draft.name.trim(),
  userName: draft.userName.trim(),
  inputHint: draft.inputHint.trim(),
});

// 比较“有没有改过”用：Blob 没法直接比较，换成有没有
const signature = (draft) => JSON.stringify({ ...trimmedDraft(draft), pending: draft.pending ? 'new' : null });

// 一边气泡的颜色设置：五个单选、自定义时的两个颜色、预览、恢复默认
function BubbleEditor({ id, label, value, onChange }) {
  const custom = value.preset === 'custom';
  const colors = custom ? { bg: normalizeHex(value.bg), fg: normalizeHex(value.fg) } : bubbleColors(value);
  const ready = Boolean(colors && colors.bg && colors.fg);
  const ratio = ready ? contrastRatio(colors.bg, colors.fg) : null;
  const set = (patch) => onChange({ ...value, ...patch });

  return (
    <fieldset className="cs-fieldset cs-bubble-group">
      <legend>{label}</legend>
      {BUBBLE_PRESETS.map((preset) => (
        <label key={preset.id} className={`cs-choice${value.preset === preset.id ? ' is-on' : ''}`}>
          <input type="radio" name={id} value={preset.id} checked={value.preset === preset.id} onChange={() => set({ preset: preset.id })} />
          <span className="cs-swatch" aria-hidden="true" style={{ background: preset.bg }} />
          <span className="cs-choice-text">
            <span className="cs-choice-title">{preset.label}</span>
          </span>
        </label>
      ))}
      <label className={`cs-choice${custom ? ' is-on' : ''}`}>
        <input type="radio" name={id} value="custom" checked={custom} onChange={() => set({ preset: 'custom' })} />
        <span className="cs-swatch" aria-hidden="true" style={{ background: normalizeHex(value.bg) || 'transparent' }} />
        <span className="cs-choice-text">
          <span className="cs-choice-title">自定义</span>
          <span className="cs-choice-hint">自己选底色和字色</span>
        </span>
      </label>

      {custom && (
        <div className="cs-custom stack">
          {[
            { key: 'bg', name: '底色' },
            { key: 'fg', name: '字色' },
          ].map((item) => (
            <div className="field" key={item.key}>
              <label htmlFor={`${id}-${item.key}`}>{item.name}（# 加 6 位，例如 #f7b4ce）</label>
              <div className="cs-color-row">
                <input
                  id={`${id}-${item.key}`}
                  className="field-input"
                  type="text"
                  maxLength={7}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={value[item.key]}
                  onChange={(event) => set({ [item.key]: event.target.value })}
                />
                <input
                  className="cs-color-pick"
                  type="color"
                  aria-label={`用色盘选${item.name}`}
                  value={normalizeHex(value[item.key]) || '#000000'}
                  onChange={(event) => set({ [item.key]: event.target.value })}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {value.preset === '' && <p className="muted">现在用的是默认颜色。</p>}
      {value.preset !== '' && !ready && <p className="field-note">颜色代码不对。请写成 # 加 6 位，例如 #f7b4ce。</p>}
      {ready && (
        <>
          <div className="cs-bubble-preview" style={{ background: colors.bg, color: colors.fg }}>
            这是气泡的样子
          </div>
          <p className="muted">
            对比度 {ratio.toFixed(1)} 比 1，{ratio >= MIN_CONTRAST ? '够清楚' : '偏低，保存时会提醒你'}。
          </p>
        </>
      )}
      <button type="button" className="btn btn-block" disabled={value.preset === ''} onClick={() => set({ preset: '' })}>
        恢复默认颜色
      </button>
    </fieldset>
  );
}

export default function ChatSettings() {
  const { query } = useRoute();
  const idParam = query.get('id');

  const [status, setStatus] = useState('loading'); // loading | ready | missing | failed
  const [chat, setChat] = useState(null);
  const [character, setCharacter] = useState(null);
  const [defaultName, setDefaultName] = useState('对话 1');
  const [messageCount, setMessageCount] = useState(0);
  const [saved, setSaved] = useState(null);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState('');
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmLow, setConfirmLow] = useState(false);

  const fileRef = useRef(null);
  const previewRef = useRef('');
  const [preview, setPreview] = useState('');

  useEffect(() => {
    let alive = true;
    setStatus('loading');
    (async () => {
      try {
        const found = idParam ? await resolveChat({ chatId: idParam }) : null;
        const owner = found ? await getCharacter(found.characterId) : null;
        if (!alive) return;
        if (!found || !owner) {
          setStatus('missing');
          announce('没有找到这个聊天', { assertive: true });
          playSound('error');
          return;
        }
        const [fallbackName, rows] = await Promise.all([getDialogName({ ...found, name: '' }), listMessages(found.id)]);
        if (!alive) return;
        setChat(found);
        setCharacter(owner);
        setDefaultName(fallbackName);
        setMessageCount(rows.length);
        const initial = toDraft(found);
        setSaved(initial);
        setDraft(initial);
        setStatus('ready');
      } catch (error) {
        if (!alive) return;
        setStatus('failed');
        announce(`读取聊天设置失败：${error?.message || '未知错误'}`, { assertive: true });
        playSound('error');
      }
    })();
    return () => {
      alive = false;
    };
  }, [idParam]);

  const dirty = status === 'ready' && signature(draft) !== signature(saved);

  const say = (message, { assertive = false, sound = null } = {}) => {
    announce(message, { assertive });
    if (sound) playSound(sound);
  };

  const change = (key, value) => {
    setDraft((previous) => ({ ...previous, [key]: value }));
    setConfirmLeave(false);
    setConfirmLow(false);
  };

  const changeBubble = (side, next) => {
    setDraft((previous) => ({ ...previous, bubble: { ...previous.bubble, [side]: next } }));
    setConfirmLeave(false);
    setConfirmLow(false);
  };

  const disarm = () => {
    setConfirmClear(false);
    setConfirmDelete(false);
    setConfirmLeave(false);
    setConfirmLow(false);
  };

  // 刚选好的图片的预览地址：换图或离开页面时释放
  const setPreviewBlob = (blob) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = blob ? URL.createObjectURL(blob) : '';
    setPreview(previewRef.current);
  };
  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    []
  );

  const pickImage = () => {
    disarm();
    playSound('tap');
    if (fileRef.current) fileRef.current.click();
  };

  const onFile = async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    setBusy('image');
    say('正在处理图片');
    try {
      const blob = await fileToAvatarBlob(file);
      setPreviewBlob(blob);
      change('pending', blob);
      say('图片已选好。点“保存”后才会生效', { sound: 'success' });
    } catch (error) {
      say(`没能用这张图片：${error?.message || '未知错误'}`, { assertive: true, sound: 'error' });
    } finally {
      setBusy('');
    }
  };

  const removeImage = () => {
    disarm();
    setPreviewBlob(null);
    setDraft((previous) => ({ ...previous, avatarId: null, pending: null }));
    setConfirmLeave(false);
    say('已移除图片，头像会改用名字的第一个字。点“保存”后才会生效', { sound: 'tap' });
  };

  const save = async () => {
    if (!chat || busy) return;
    const clean = trimmedDraft(draft);

    // 气泡颜色：自定义的颜色代码要对；对比度低于 4.5 比 1 先提醒，再点一次才保存
    const bubble = {};
    const lowSides = [];
    for (const side of ['character', 'user']) {
      const value = clean.bubble[side];
      if (value.preset !== 'custom') {
        bubble[side] = { ...value };
        continue;
      }
      const bg = normalizeHex(value.bg);
      const fg = normalizeHex(value.fg);
      if (!bg || !fg) {
        say(`${SIDE_LABEL[side]}的${bg ? '字色' : '底色'}不是正确的颜色代码。请写成 # 加 6 位，例如 #f7b4ce`, { assertive: true, sound: 'error' });
        return;
      }
      bubble[side] = { preset: 'custom', bg, fg };
      if (contrastRatio(bg, fg) < MIN_CONTRAST) lowSides.push(SIDE_LABEL[side]);
    }
    if (lowSides.length > 0 && !confirmLow) {
      setConfirmLow(true);
      say(`${lowSides.join('、')}的字色和底色对比度低于 4.5 比 1，字可能看不清。想改请调整颜色；仍要保存，请再点一次保存`, { assertive: true, sound: 'error' });
      return;
    }

    disarm();
    setBusy('save');
    let newImageId = null;
    try {
      let avatarImageId = clean.avatarId;
      if (clean.pending) {
        newImageId = await saveImage(clean.pending, 'avatar');
        avatarImageId = newImageId;
      }
      const updated = await updateChatSettings(chat.id, {
        name: clean.name,
        userProfile: {
          name: clean.userName,
          avatarImageId,
          avatar: '',
          persona: clean.persona,
          inputHint: clean.inputHint,
        },
        systemPrompt: clean.systemPrompt,
        reactionGuide: clean.reactionGuide,
        bubbleStyle: bubble,
        typingStyle: clean.typingStyle,
        keepAlive: clean.keepAlive,
      });
      setChat(updated);
      setPreviewBlob(null);
      const next = toDraft(updated);
      setSaved(next);
      setDraft(next);
      say('已保存', { sound: 'success' });
    } catch (error) {
      // 图片已经存了但设置没存成：把这张图删掉，不留垃圾
      if (newImageId !== null) deleteImage(newImageId).catch(() => {});
      say(`保存失败，你填的内容还在页面上：${error?.message || '未知错误'}`, { assertive: true, sound: 'error' });
    } finally {
      setBusy('');
    }
  };

  const backToChat = () => {
    if (!chat) {
      navigate('/chats');
      return;
    }
    if (dirty && !confirmLeave) {
      setConfirmLeave(true);
      setConfirmClear(false);
      setConfirmDelete(false);
      say('有没保存的修改。再点一次“放弃修改并返回”会丢掉它们；想留下请先点“保存”', { assertive: true, sound: 'error' });
      return;
    }
    playSound('tap');
    navigate(`/chat?id=${chat.id}`);
  };

  const clearMessages = async () => {
    if (!chat || busy) return;
    if (!confirmClear) {
      setConfirmClear(true);
      setConfirmDelete(false);
      setConfirmLeave(false);
      say(`再点一次“确认清空”，会删掉这个对话里的 ${messageCount} 条消息，包括重新生成留下的回复。角色和设置会保留`, { assertive: true });
      return;
    }
    setConfirmClear(false);
    setBusy('clear');
    try {
      await clearChatMessages(chat.id);
      setMessageCount(0);
      say('已清空聊天记录', { sound: 'success' });
    } catch (error) {
      say(`清空失败：${error?.message || '未知错误'}`, { assertive: true, sound: 'error' });
    } finally {
      setBusy('');
    }
  };

  const removeChat = async () => {
    if (!chat || busy) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      setConfirmClear(false);
      setConfirmLeave(false);
      say(`再点一次“确认删除”，会删掉这个对话框和里面的 ${messageCount} 条消息。角色 ${character.name} 会保留`, { assertive: true });
      return;
    }
    setConfirmDelete(false);
    setBusy('delete');
    try {
      await deleteChat(chat.id);
      say('已删除这个对话框，角色还在', { sound: 'success' });
      navigate('/chats');
    } catch (error) {
      setBusy('');
      say(`删除失败：${error?.message || '未知错误'}`, { assertive: true, sound: 'error' });
    }
  };

  if (status !== 'ready') {
    let message = '正在读取……';
    let heading = null;
    if (status === 'missing') {
      heading = '没有找到这个聊天';
      message = '这个聊天或者它的角色已经不在了。请回到聊天列表。';
    } else if (status === 'failed') {
      heading = '读取失败';
      message = '没能读出这个聊天的设置。请刷新页面再试；如果一直这样，请到诊断页测试数据库。';
    }
    return (
      <Screen title="聊天设置" backTo="/chats" backLabel="返回聊天列表">
        {heading ? (
          <div className="card stack" role="alert">
            <h2>{heading}</h2>
            <p>{message}</p>
          </div>
        ) : (
          <p className="muted" role="status">
            {message}
          </p>
        )}
      </Screen>
    );
  }

  const previewName = draft.userName.trim() || '我';
  const hasImage = Boolean(draft.pending) || draft.avatarId !== null;

  const actions = (
    <div className="cs-actions">
      <button type="button" className="btn btn-primary btn-block" onClick={save} disabled={busy !== ''}>
        {busy === 'save' ? '正在保存……' : confirmLow ? '对比度偏低，仍然保存（再点一次）' : dirty ? '保存（有没保存的修改）' : '保存'}
      </button>
      <button type="button" className="btn btn-block" onClick={backToChat}>
        {confirmLeave ? '放弃修改并返回' : '返回聊天'}
      </button>
    </div>
  );

  return (
    <Screen title="聊天设置" subtitle={`${character.name} · ${saved.name || defaultName}`} actions={actions}>
      <section className="card stack" aria-labelledby="cs-dialog">
        <h2 id="cs-dialog">对话名</h2>
        <div className="field">
          <label htmlFor="cs-name">这个对话叫什么</label>
          <input
            id="cs-name"
            className="field-input"
            type="text"
            maxLength={30}
            autoComplete="off"
            placeholder={defaultName}
            value={draft.name}
            onChange={(event) => change('name', event.target.value)}
          />
          <p className="muted">不填就叫“{defaultName}”。同一个角色可以有好几个对话。</p>
        </div>
      </section>

      <section className="card stack" aria-labelledby="cs-profile">
        <h2 id="cs-profile">我的个人信息</h2>
        <p className="muted">只用在这个对话里，别的对话可以填不一样的。</p>

        <div className="cs-avatar-row">
          <Avatar character={{ id: chat.id, name: previewName, avatar: draft.pending ? preview : '', avatarImageId: draft.pending ? null : draft.avatarId }} size="xl" />
          <p className="cs-avatar-note">{hasImage ? '头像：用你选的图片' : `头像：用名字的第一个字“${Array.from(previewName)[0]}”`}</p>
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="cs-file" tabIndex={-1} aria-hidden="true" onChange={onFile} />
        <button type="button" className="btn btn-block" onClick={pickImage} disabled={busy !== ''}>
          {busy === 'image' ? '正在处理图片……' : hasImage ? '换一张图片' : '选择图片'}
        </button>
        {hasImage && (
          <button type="button" className="btn btn-block" onClick={removeImage} disabled={busy !== ''}>
            移除图片
          </button>
        )}

        <div className="field">
          <label htmlFor="cs-user-name">我的名字</label>
          <input
            id="cs-user-name"
            className="field-input"
            type="text"
            maxLength={20}
            autoComplete="off"
            placeholder="我"
            value={draft.userName}
            onChange={(event) => change('userName', event.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="cs-persona">我的人设</label>
          <textarea
            id="cs-persona"
            className="field-input cs-area"
            rows={5}
            aria-describedby="cs-persona-note"
            value={draft.persona}
            onChange={(event) => change('persona', event.target.value)}
          />
          <p id="cs-persona-note" className="muted">
            告诉角色你是谁、有什么特点。它会放进交给 AI 的内容里，标题是“关于用户”。
          </p>
        </div>

        <div className="field">
          <label htmlFor="cs-hint">输入框里的提示语</label>
          <input
            id="cs-hint"
            className="field-input"
            type="text"
            maxLength={40}
            autoComplete="off"
            placeholder="说点什么……"
            value={draft.inputHint}
            onChange={(event) => change('inputHint', event.target.value)}
          />
        </div>
      </section>

      <section className="card stack" aria-labelledby="cs-prompt">
        <h2 id="cs-prompt">提示词</h2>
        <div className="field">
          <label htmlFor="cs-system">本聊天的总提示词</label>
          <textarea
            id="cs-system"
            className="field-input cs-area"
            rows={6}
            aria-describedby="cs-system-note"
            value={draft.systemPrompt}
            onChange={(event) => change('systemPrompt', event.target.value)}
          />
          <p id="cs-system-note" className="muted">
            只对这个对话有效，会和角色人设一起交给 AI。
          </p>
        </div>

        <div className="field">
          <label htmlFor="cs-guide">角色反应指导</label>
          <textarea
            id="cs-guide"
            className="field-input cs-area"
            rows={6}
            aria-describedby="cs-guide-note"
            value={draft.reactionGuide}
            onChange={(event) => change('reactionGuide', event.target.value)}
          />
          <p id="cs-guide-note" className="muted">
            用来指导角色怎么回应你，比如说话的语气、遇到什么情况该怎么反应。
          </p>
        </div>
      </section>

      <section className="card stack" aria-labelledby="cs-bubble">
        <h2 id="cs-bubble">气泡颜色</h2>
        <p className="muted">只对这个对话有效。自定义时会检查字色和底色的对比度，低于 4.5 比 1 会提醒你。</p>
        <BubbleEditor id="cs-bubble-character" label="角色的气泡" value={draft.bubble.character} onChange={(next) => changeBubble('character', next)} />
        <BubbleEditor id="cs-bubble-user" label="我的气泡" value={draft.bubble.user} onChange={(next) => changeBubble('user', next)} />
      </section>

      <section className="card stack" aria-labelledby="cs-typing">
        <h2 id="cs-typing">打字指示器</h2>
        <fieldset className="cs-fieldset">
          <legend>角色回复时显示哪一种</legend>
          {STYLE_OPTIONS.map((option) => (
            <label key={option.value} className={`cs-choice${draft.typingStyle === option.value ? ' is-on' : ''}`}>
              <input
                type="radio"
                name="cs-typing-style"
                value={option.value}
                checked={draft.typingStyle === option.value}
                onChange={() => change('typingStyle', option.value)}
              />
              <span className="cs-choice-text">
                <span className="cs-choice-title">{option.label}</span>
                <span className="cs-choice-hint">{option.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <p className="muted">读屏只会在回复时读一次“正在输入”。系统开了“减少动态效果”时，只显示文字。</p>
      </section>

      <section className="card stack" aria-labelledby="cs-alive">
        <h2 id="cs-alive">后台保活</h2>
        <label className={`cs-choice${draft.keepAlive ? ' is-on' : ''}`}>
          <input
            type="checkbox"
            checked={draft.keepAlive}
            aria-describedby="cs-alive-note"
            onChange={(event) => change('keepAlive', event.target.checked)}
          />
          <span className="cs-choice-text">
            <span className="cs-choice-title">{draft.keepAlive ? '已开启' : '已关闭'}</span>
          </span>
        </label>
        <p id="cs-alive-note" className="muted">
          默认关闭。可能和读屏语音互相干扰，不保证准时。现在只是把这个开关存下来，真正的保活要等做提醒之前再加。
        </p>
      </section>

      <section className="card stack" aria-labelledby="cs-danger">
        <h2 id="cs-danger">清空和删除</h2>
        <p className="muted">这个对话里现在有 {messageCount} 条消息。下面两个按钮都要点两下才会执行，删掉的内容找不回来。</p>
        <button type="button" className="btn btn-block" onClick={clearMessages} disabled={busy !== ''}>
          {busy === 'clear' ? '正在清空……' : confirmClear ? '确认清空（再点一次）' : '清空聊天记录'}
        </button>
        <button type="button" className="btn btn-block" onClick={removeChat} disabled={busy !== ''}>
          {busy === 'delete' ? '正在删除……' : confirmDelete ? '确认删除（再点一次）' : '删除这个对话框'}
        </button>
        <p className="muted">删除对话框只删这个对话和里面的消息，角色“{character.name}”还在，可以重新开一个新对话。</p>
      </section>
    </Screen>
  );
}