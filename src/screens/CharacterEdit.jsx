// src/screens/CharacterEdit.jsx
import { useEffect, useRef, useState } from 'react';
import Avatar from '../components/Avatar';
import Screen from '../components/Screen';
import { announce } from '../services/announcer';
import {
  NAME_MAX,
  TEXT_MAX,
  buildExportData,
  createCharacter,
  deleteCharacter,
  downloadJson,
  exportFileName,
  getFootprint,
  getLibraryCharacter,
  listLibrary,
  updateCharacter,
} from '../services/characterService';
import { fileToAvatarBlob } from '../services/imageService';
import { navigate, useRoute } from '../services/router';
import { playSound } from '../services/soundService';
import '../styles/chat.css';
import '../styles/forms.css';
import '../styles/chatsettings.css';
import '../styles/characters.css';

// 角色编辑页（包 2d）。地址 /characters/edit?id=角色id 是修改，不带 id 是新建。
// 和聊天设置页一样：改动先放草稿，点“保存”才写入；有没保存的修改时，离开要再点一次。
// 头像：选好的图片先放在草稿里，点“保存”才存进 images 表（规矩见 imageService.js）。
// 导出：导出的是已保存的内容。删除角色：点两下，说清会连带删掉多少个对话和消息。

const EMPTY = { name: '', bio: '', extraNotes: '', pending: null, removeAvatar: false };

const toDraft = (character) => ({
  name: character.name,
  bio: character.bio,
  extraNotes: character.extraNotes,
  pending: null,
  removeAvatar: false,
});

const signature = (draft) => JSON.stringify({ ...draft, name: draft.name.trim(), pending: draft.pending ? 'new' : null });

export default function CharacterEdit() {
  const { query } = useRoute();
  const idParam = query.get('id');
  const isNew = !idParam;

  const [status, setStatus] = useState('loading'); // loading | ready | missing | failed
  const [character, setCharacter] = useState(null);
  const [saved, setSaved] = useState(EMPTY);
  const [draft, setDraft] = useState(EMPTY);
  const [otherNames, setOtherNames] = useState([]);
  const [footprint, setFootprint] = useState({ chats: 0, messages: 0 });
  const [busy, setBusy] = useState('');
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [leaveTarget, setLeaveTarget] = useState('');

  const fileRef = useRef(null);
  const previewRef = useRef('');
  const [preview, setPreview] = useState('');

  useEffect(() => {
    let alive = true;
    setStatus('loading');
    (async () => {
      try {
        const library = await listLibrary();
        const found = isNew ? null : await getLibraryCharacter(idParam);
        if (!alive) return;
        if (!isNew && !found) {
          setStatus('missing');
          announce('没有找到这个角色', { assertive: true });
          playSound('error');
          return;
        }
        setOtherNames(library.filter((row) => !found || row.character.id !== found.id).map((row) => row.character.name));
        if (found) {
          const counts = await getFootprint(found.id);
          if (!alive) return;
          setFootprint(counts);
          setCharacter(found);
          const initial = toDraft(found);
          setSaved(initial);
          setDraft(initial);
        } else {
          setCharacter(null);
          setSaved(EMPTY);
          setDraft(EMPTY);
        }
        setStatus('ready');
      } catch (error) {
        if (!alive) return;
        setStatus('failed');
        announce(`读取角色失败：${error?.message || '未知错误'}`, { assertive: true });
        playSound('error');
      }
    })();
    return () => {
      alive = false;
    };
  }, [idParam, isNew]);

  const dirty = status === 'ready' && signature(draft) !== signature(saved);

  const say = (message, { assertive = false, sound = null } = {}) => {
    announce(message, { assertive });
    if (sound) playSound(sound);
  };

  const disarm = () => {
    setConfirmLeave(false);
    setConfirmDelete(false);
  };

  const change = (key, value) => {
    setDraft((previous) => ({ ...previous, [key]: value }));
    disarm();
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
      setDraft((previous) => ({ ...previous, pending: blob, removeAvatar: false }));
      disarm();
      say('图片已选好。点“保存”后才会生效', { sound: 'success' });
    } catch (error) {
      say(`没能用这张图片：${error?.message || '未知错误'}`, { assertive: true, sound: 'error' });
    } finally {
      setBusy('');
    }
  };

  const removeImage = () => {
    setPreviewBlob(null);
    setDraft((previous) => ({ ...previous, pending: null, removeAvatar: true }));
    disarm();
    say('已移除图片，头像会改用名字的第一个字。点“保存”后才会生效', { sound: 'tap' });
  };

  const save = async () => {
    if (busy) return;
    const name = draft.name.trim();
    if (!name) {
      say('名字不能是空的。请先填名字', { assertive: true, sound: 'error' });
      document.getElementById('ce-name')?.focus();
      return;
    }
    disarm();
    setBusy('save');
    try {
      if (isNew) {
        await createCharacter({ name, bio: draft.bio, extraNotes: draft.extraNotes, avatarBlob: draft.pending });
        say(`已创建角色“${name}”。可以到聊天列表里开始聊天`, { sound: 'success' });
        navigate('/characters');
        return;
      }
      const updated = await updateCharacter(character.id, {
        name,
        bio: draft.bio,
        extraNotes: draft.extraNotes,
        avatarBlob: draft.pending,
        removeAvatar: draft.removeAvatar,
      });
      setCharacter(updated);
      setPreviewBlob(null);
      const next = toDraft(updated);
      setSaved(next);
      setDraft(next);
      say('已保存', { sound: 'success' });
    } catch (error) {
      say(`保存失败，你填的内容还在页面上：${error?.message || '未知错误'}`, { assertive: true, sound: 'error' });
    } finally {
      setBusy('');
    }
  };

  // 离开本页：有没保存的修改时，第一下只提醒，第二下才放弃修改并离开
  const leaveTo = (path) => {
    if (dirty && !(confirmLeave && leaveTarget === path)) {
      setConfirmLeave(true);
      setLeaveTarget(path);
      setConfirmDelete(false);
      say('有没保存的修改。再点一次同一个按钮会放弃它们；想留下请先点“保存”', { assertive: true, sound: 'error' });
      return;
    }
    playSound('tap');
    navigate(path);
  };

  const exportCharacter = async () => {
    if (!character || busy) return;
    disarm();
    setBusy('export');
    try {
      const data = await buildExportData(character.id);
      const fileName = exportFileName(character.name);
      downloadJson(data, fileName);
      say(
        `已把“${character.name}”交给浏览器下载，文件名是 ${fileName}。导出的是已保存的内容${dirty ? '，页面上没保存的修改不在里面' : ''}。文件最后存在哪由你的系统决定，请到下载或文件里确认`,
        { sound: 'success' }
      );
    } catch (error) {
      say(`导出失败：${error?.message || '未知错误'}`, { assertive: true, sound: 'error' });
    } finally {
      setBusy('');
    }
  };

  const removeCharacter = async () => {
    if (!character || busy) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      setConfirmLeave(false);
      say(
        `再点一次“确认删除”，会删掉角色“${character.name}”，以及它的 ${footprint.chats} 个对话和里面的 ${footprint.messages} 条消息、头像图片。删掉的内容找不回来。想留下对话，请不要删`,
        { assertive: true }
      );
      return;
    }
    setConfirmDelete(false);
    setBusy('delete');
    try {
      const result = await deleteCharacter(character.id);
      say(`已删除角色“${character.name}”，同时删掉了 ${result.chats} 个对话和 ${result.messages} 条消息`, { sound: 'success' });
      navigate('/characters');
    } catch (error) {
      setBusy('');
      say(`删除失败：${error?.message || '未知错误'}`, { assertive: true, sound: 'error' });
    }
  };

  if (status !== 'ready') {
    let message = '正在读取……';
    let heading = null;
    if (status === 'missing') {
      heading = '没有找到这个角色';
      message = '这个角色已经不在了。请回到角色库。';
    } else if (status === 'failed') {
      heading = '读取失败';
      message = '没能读出这个角色。请刷新页面再试；如果一直这样，请到诊断页测试数据库。';
    }
    return (
      <Screen title={isNew ? '新建角色' : '编辑角色'} backTo="/characters" backLabel="返回角色库">
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

  const previewName = draft.name.trim() || '?';
  const hasImage = Boolean(draft.pending) || (!draft.removeAvatar && character && (character.avatarImageId !== null || character.avatar.startsWith('data:image/')));
  const sameName = draft.name.trim() !== '' && otherNames.includes(draft.name.trim());

  const avatarPreview = {
    id: character ? character.id : 0,
    name: previewName,
    avatar: draft.pending ? preview : draft.removeAvatar || !character ? '' : character.avatar,
    avatarImageId: draft.pending || draft.removeAvatar || !character ? null : character.avatarImageId,
  };

  const actions = (
    <div className="cs-actions">
      <button type="button" className="btn btn-primary btn-block" onClick={save} disabled={busy !== ''}>
        {busy === 'save' ? '正在保存……' : isNew ? '创建角色' : dirty ? '保存（有没保存的修改）' : '保存'}
      </button>
      <button type="button" className="btn btn-block" onClick={() => leaveTo('/characters')}>
        {confirmLeave && leaveTarget === '/characters' ? '放弃修改并返回' : '返回角色库'}
      </button>
    </div>
  );

  return (
    <Screen
      title={isNew ? '新建角色' : '编辑角色'}
      docTitle={isNew ? '新建角色' : `编辑角色 ${saved.name}`}
      subtitle={isNew ? '写好名字和人设，点“创建角色”。' : saved.name}
      actions={actions}
    >
      <section className="card stack" aria-labelledby="ce-basic">
        <h2 id="ce-basic">名字和头像</h2>

        <div className="field">
          <label htmlFor="ce-name">名字（必填）</label>
          <input
            id="ce-name"
            className="field-input"
            type="text"
            maxLength={NAME_MAX}
            autoComplete="off"
            aria-required="true"
            aria-describedby={sameName ? 'ce-name-note' : undefined}
            value={draft.name}
            onChange={(event) => change('name', event.target.value)}
          />
          {sameName && (
            <p id="ce-name-note" className="field-note">
              已经有一个叫这个名字的角色了。聊天列表里会分不清谁是谁，建议换一个。
            </p>
          )}
        </div>

        <div className="cs-avatar-row">
          <Avatar character={avatarPreview} size="xl" />
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
      </section>

      <section className="card stack" aria-labelledby="ce-persona">
        <h2 id="ce-persona">人设</h2>
        <div className="field">
          <label htmlFor="ce-bio">详细人设</label>
          <textarea
            id="ce-bio"
            className="field-input cs-area"
            rows={8}
            maxLength={TEXT_MAX}
            aria-describedby="ce-bio-note"
            value={draft.bio}
            onChange={(event) => change('bio', event.target.value)}
          />
          <p id="ce-bio-note" className="muted">
            这个角色是谁、性格、说话的习惯。聊天时会交给 AI，标题是“角色人设”。
          </p>
        </div>
        <div className="field">
          <label htmlFor="ce-notes">补充细节</label>
          <textarea
            id="ce-notes"
            className="field-input cs-area"
            rows={6}
            maxLength={TEXT_MAX}
            aria-describedby="ce-notes-note"
            value={draft.extraNotes}
            onChange={(event) => change('extraNotes', event.target.value)}
          />
          <p id="ce-notes-note" className="muted">
            人设里写不下的背景、关系、喜好。聊天时一起交给 AI，标题是“补充细节”。
          </p>
        </div>
      </section>

      {!isNew && (
        <>
          <section className="card stack" aria-labelledby="ce-chat">
            <h2 id="ce-chat">聊天</h2>
            <p className="muted">现在有 {footprint.chats} 个对话。</p>
            <button type="button" className="btn btn-block" onClick={() => leaveTo(`/chat?c=${character.id}`)}>
              {confirmLeave && leaveTarget === `/chat?c=${character.id}` ? '放弃修改并去聊天' : '和 TA 聊天'}
            </button>
          </section>

          <section className="card stack" aria-labelledby="ce-export">
            <h2 id="ce-export">导出</h2>
            <p className="muted">把这个角色存成一个文件，可以备份，也可以在别的设备上用角色库的“导入角色”读回来。文件里有名字、人设、补充细节和头像，没有对话记录。导出的是已保存的内容。</p>
            <button type="button" className="btn btn-block" onClick={exportCharacter} disabled={busy !== ''}>
              {busy === 'export' ? '正在导出……' : '导出这个角色'}
            </button>
          </section>

          <section className="card stack" aria-labelledby="ce-danger">
            <h2 id="ce-danger">删除角色</h2>
            <p className="muted">
              删除会连同这个角色的 {footprint.chats} 个对话、{footprint.messages} 条消息和头像图片一起删掉，找不回来。导出文件里没有对话记录，所以导出不能保住对话。要点两下才会执行。
            </p>
            <button type="button" className="btn btn-block" onClick={removeCharacter} disabled={busy !== ''}>
              {busy === 'delete' ? '正在删除……' : confirmDelete ? '确认删除（再点一次）' : '删除这个角色'}
            </button>
          </section>
        </>
      )}
    </Screen>
  );
}