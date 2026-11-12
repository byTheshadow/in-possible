// src/screens/Characters.jsx
import { useEffect, useRef, useState } from 'react';
import Avatar from '../components/Avatar';
import Screen from '../components/Screen';
import { announce } from '../services/announcer';
import { TEXT_MAX, importCharacters, listLibrary, prepareImport } from '../services/characterService';
import { navigate } from '../services/router';
import { playSound } from '../services/soundService';
import '../styles/chat.css';
import '../styles/characters.css';

// 角色库（包 2d）：角色列表、新建、导入。地址 /characters。
// 每一行是一个链接，点进去编辑（/characters/edit?id=角色id）。新建是 /characters/edit（不带 id）。
// 导入只认本站自己导出的角色文件。流程分两步：先选文件，页面列出“将新增哪些角色、哪些会改名”，
// 用户点“确认导入”才写入；不会覆盖已有的角色，重名的在名字后面加（2）。

const bioPreview = (bio) => {
  const text = (bio || '').replace(/\s+/g, ' ').trim();
  if (!text) return '还没有写人设';
  const chars = Array.from(text);
  return chars.length > 40 ? `${chars.slice(0, 40).join('')}……` : text;
};

export default function Characters() {
  const [rows, setRows] = useState(null);
  const [failed, setFailed] = useState(false);
  const [stage, setStage] = useState('idle'); // idle | reading | preview | importing
  const [prepared, setPrepared] = useState(null);
  const [notice, setNotice] = useState('');

  const fileRef = useRef(null);
  const previewRef = useRef(null);

  const refresh = async () => {
    const result = await listLibrary();
    setRows(result);
    return result;
  };

  useEffect(() => {
    let alive = true;
    listLibrary()
      .then((result) => {
        if (alive) setRows(result);
      })
      .catch((error) => {
        if (!alive) return;
        setFailed(true);
        announce(`读取角色库失败：${error?.message || '未知错误'}`, { assertive: true });
        playSound('error');
      });
    return () => {
      alive = false;
    };
  }, []);

  // 预览出现时，把焦点放到“确认导入”标题上，读屏立刻读出要导入什么
  useEffect(() => {
    if (stage === 'preview' && previewRef.current) previewRef.current.focus();
  }, [stage]);

  const busy = stage === 'reading' || stage === 'importing';

  const go = (path) => {
    playSound('tap');
    navigate(path);
  };

  const pickFile = () => {
    if (busy) return;
    playSound('tap');
    setNotice('');
    if (fileRef.current) fileRef.current.click();
  };

  const onFile = async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    setStage('reading');
    announce('正在读取角色文件');
    try {
      const result = await prepareImport(file);
      setPrepared(result);
      setStage('preview');
      const renamedCount = result.plan.filter((item) => item.renamed).length;
      announce(
        `文件里有 ${result.plan.length} 个角色，导入后会新增 ${result.plan.length} 个${renamedCount > 0 ? `，其中 ${renamedCount} 个因为重名会改名` : ''}。点“确认导入”才会写入，点“取消导入”什么都不会改`
      );
    } catch (error) {
      setStage('idle');
      setPrepared(null);
      announce(`不能导入：${error?.message || '未知错误'}`, { assertive: true });
      playSound('error');
      setNotice(`不能导入：${error?.message || '未知错误'}`);
    }
  };

  const cancelImport = () => {
    playSound('tap');
    setPrepared(null);
    setStage('idle');
    setNotice('已取消导入，没有改动任何角色');
    announce('已取消导入，没有改动任何角色');
  };

  const confirmImport = async () => {
    if (!prepared || stage !== 'preview') return;
    setStage('importing');
    announce('正在导入');
    let result;
    try {
      result = await importCharacters(prepared.plan);
    } catch (error) {
      setStage('preview');
      const message = `导入失败：${error?.message || '未知错误'}。可以再点一次“确认导入”重试`;
      setNotice(message);
      announce(message, { assertive: true });
      playSound('error');
      return;
    }
    setPrepared(null);
    setStage('idle');
    try {
      await refresh();
    } catch (error) {
      setFailed(true);
    }
    const parts = [`已导入 ${result.created.length} 个角色`];
    const renamed = result.created.filter((item) => item.renamed).length;
    if (renamed > 0) parts.push(`其中 ${renamed} 个因为重名加了编号`);
    if (result.avatarFailed > 0) parts.push(`${result.avatarFailed} 个头像没能处理，这些角色改用名字的第一个字`);
    if (result.failed.length > 0) parts.push(`${result.failed.length} 个没能导入：${result.failed.map((item) => item.name).join('、')}`);
    const message = `${parts.join('；')}。`;
    setNotice(message);
    announce(message, { assertive: result.failed.length > 0 });
    playSound(result.failed.length > 0 ? 'error' : 'success');
  };

  let actions;
  if (stage === 'preview' || (stage === 'importing' && prepared)) {
    actions = (
      <div className="chat-actions">
        <button type="button" className="btn btn-primary btn-block" onClick={confirmImport} disabled={busy}>
          {stage === 'importing' ? '正在导入……' : `确认导入 ${prepared ? prepared.plan.length : 0} 个角色`}
        </button>
        <button type="button" className="btn btn-block" onClick={cancelImport} disabled={busy}>
          取消导入
        </button>
      </div>
    );
  } else {
    actions = (
      <div className="chat-actions">
        <button type="button" className="btn btn-primary btn-block" onClick={() => go('/characters/edit')} disabled={busy}>
          + 新建角色
        </button>
        <button type="button" className="btn btn-block" onClick={pickFile} disabled={busy}>
          {stage === 'reading' ? '正在读取……' : '导入角色'}
        </button>
        <button type="button" className="btn btn-block" onClick={() => go('/chats')} disabled={busy}>
          返回聊天列表
        </button>
      </div>
    );
  }

  let body;
  if (failed) {
    body = (
      <div className="card stack" role="alert">
        <h2>读取失败</h2>
        <p>没能读出角色库。请刷新页面再试；如果一直这样，请到诊断页测试数据库。</p>
      </div>
    );
  } else if (rows === null) {
    body = (
      <p className="muted" role="status">
        正在读取……
      </p>
    );
  } else if (prepared && (stage === 'preview' || stage === 'importing')) {
    const { plan, skipped, truncated, badAvatars, fileName } = prepared;
    body = (
      <section className="card stack" aria-labelledby="cl-preview-title">
        <h2 id="cl-preview-title" ref={previewRef} tabIndex={-1}>
          确认导入
        </h2>
        <p>
          文件“{fileName}”里有 {plan.length} 个可以导入的角色。导入后会新增 {plan.length} 个角色，不会覆盖已有的角色。
        </p>
        <ul className="list" role="list" aria-label="将要新增的角色">
          {plan.map((item, index) => (
            <li key={`${item.finalName}-${index}`} className="cl-plan-row">
              <span className="cl-plan-name">{item.finalName}</span>
              <span className="cl-plan-note">
                {item.renamed ? `原名“${item.name}”，和已有角色重名，已加编号。` : '名字没有重复。'}
                {item.avatar ? '带头像。' : '没有头像。'}
              </span>
            </li>
          ))}
        </ul>
        {skipped > 0 && <p className="field-note">有 {skipped} 个条目没有名字或格式不对，已经跳过，不会导入。</p>}
        {truncated > 0 && <p className="field-note">有 {truncated} 处文字超过 {TEXT_MAX} 字，超出的部分会被截掉。</p>}
        {badAvatars > 0 && <p className="field-note">有 {badAvatars} 个头像格式不对或太大，这些角色会改用名字的第一个字。</p>}
      </section>
    );
  } else if (rows.length === 0) {
    body = (
      <>
        {notice && <p className="field-note">{notice}</p>}
        <div className="card stack">
          <h2>角色库是空的</h2>
          <p>点下面的“新建角色”写一个，或者点“导入角色”选本站导出的角色文件。有了角色才能聊天。</p>
        </div>
      </>
    );
  } else {
    body = (
      <>
        {notice && <p className="field-note">{notice}</p>}
        <nav aria-label="角色列表">
          <ul className="list" role="list">
            {rows.map(({ character, chatCount }) => (
              <li key={character.id}>
                <a href={`#/characters/edit?id=${character.id}`} className="chat-card" onClick={() => playSound('tap')}>
                  <Avatar character={character} />
                  <span className="chat-main">
                    <span className="chat-name">{character.name}</span>
                    <span className="chat-preview">
                      {bioPreview(character.bio)}，{chatCount} 个对话
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </>
    );
  }

  return (
    <Screen title="角色库" subtitle="在这里新建、修改、导入和导出角色。" actions={actions}>
      <input ref={fileRef} type="file" accept="application/json,.json" className="cl-file" tabIndex={-1} aria-hidden="true" onChange={onFile} />
      {body}
    </Screen>
  );
}