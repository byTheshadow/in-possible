import { useEffect, useMemo, useState } from 'react';
import Screen from '../components/Screen';
import { announce } from '../services/announcer';
import { listChatSummaries } from '../services/chatService';
import { MEMORY_CONFIDENCES, MEMORY_STATUSES, MEMORY_TYPES } from '../services/memoryConstants';
import {
  confirmMemoryCandidate, deleteMemory, dismissMemoryCandidate, listMemoryCandidates, listMemoryRevisions, listMemories, setMemoryStatus, updateMemory,
} from '../services/memoryService';
import { playSound } from '../services/soundService';
import '../styles/memories.css';

const TYPE_LABELS = {
  [MEMORY_TYPES.FACT]: '事实', [MEMORY_TYPES.PREFERENCE]: '偏好', [MEMORY_TYPES.EPISODE]: '经历',
  [MEMORY_TYPES.RELATIONSHIP]: '关系', [MEMORY_TYPES.CHARACTER_THOUGHT]: '角色理解',
  [MEMORY_TYPES.EMOTION]: '情绪', [MEMORY_TYPES.EXPRESSION_RULE]: '表达规则', [MEMORY_TYPES.REFLECTION]: '反思',
  [MEMORY_TYPES.CHARACTER_ACTION]: '角色行动', [MEMORY_TYPES.BELIEF]: '信念',
};
const CONFIDENCE_LABELS = { inferred: 'AI 推测', suggested: '待确认', confirmed: '已确认', user_written: '我写的' };
const formatDate = (value) => value ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(new Date(value)) : '暂无';

function MemoryEditor({ memory, onCancel, onSaved }) {
  const [title, setTitle] = useState(memory.title);
  const [content, setContent] = useState(memory.content);
  const [busy, setBusy] = useState(false);
  const save = async (event) => {
    event.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setBusy(true);
    try { const result = await updateMemory(memory.memoryId, { title: title.trim(), content: content.trim() }); onSaved(result); }
    catch (error) { announce(`保存失败：${error.message}`, { assertive: true }); setBusy(false); }
  };
  return <form className="memory-editor" onSubmit={save} aria-label={`编辑${memory.title}`}>
    <div className="field"><label htmlFor={`memory-title-${memory.memoryId}`}>标题</label><input id={`memory-title-${memory.memoryId}`} className="field-input" value={title} onChange={(e) => setTitle(e.target.value)} required /></div>
    <div className="field"><label htmlFor={`memory-content-${memory.memoryId}`}>内容</label><textarea id={`memory-content-${memory.memoryId}`} className="field-input" value={content} onChange={(e) => setContent(e.target.value)} required /></div>
    <div className="row"><button className="btn btn-primary" disabled={busy} type="submit">{busy ? '保存中……' : '保存修改'}</button><button className="btn" type="button" onClick={onCancel}>取消</button></div>
  </form>;
}

function MemoryCard({ memory, onChange }) {
  const [editing, setEditing] = useState(false);
  const [history, setHistory] = useState(null);
  const disabled = memory.status === MEMORY_STATUSES.ARCHIVED || memory.status === MEMORY_STATUSES.DORMANT;
  const toggle = async () => {
    const next = disabled ? MEMORY_STATUSES.ACTIVE : MEMORY_STATUSES.DORMANT;
    const updated = await setMemoryStatus(memory.memoryId, next, disabled ? '用户恢复使用。' : '用户暂停使用。');
    onChange(updated); announce(disabled ? `已恢复使用「${memory.title}」。` : `已停用「${memory.title}」。`);
  };
  const remove = async () => {
    if (!window.confirm(`确定删除「${memory.title}」吗？删除后不会再在聊天中使用。`)) return;
    await deleteMemory(memory.memoryId); onChange(null); announce(`已删除「${memory.title}」。`);
  };
  const showHistory = async () => setHistory(await listMemoryRevisions(memory.memoryId));
  if (editing) return <li className="memory-card"><MemoryEditor memory={memory} onCancel={() => setEditing(false)} onSaved={(updated) => { setEditing(false); onChange(updated); announce('记忆已保存。'); }} /></li>;
  return <li className={`memory-card ${disabled ? 'is-disabled' : ''}`}>
    <div className="memory-card-head"><div><span className="memory-kicker">{disabled ? '状态：已停用' : '状态：使用中'}</span><h2>{memory.title || '未命名记忆'}</h2></div><span className="memory-type">{TYPE_LABELS[memory.type] || '记忆'}</span></div>
    <p className="memory-content">{memory.content || '没有内容'}</p>
    <dl className="memory-meta"><div><dt>可信度</dt><dd>{CONFIDENCE_LABELS[memory.confidence] || memory.confidence}</dd></div><div><dt>重要程度</dt><dd>{memory.importance}/5</dd></div><div><dt>更新时间</dt><dd>{formatDate(memory.updatedAt)}</dd></div></dl>
    <div className="memory-actions"><button className="btn" type="button" onClick={() => setEditing(true)}>编辑</button><button className="btn" type="button" onClick={toggle}>{disabled ? '恢复使用' : '停用'}</button><button className="btn" type="button" onClick={showHistory}>修改历史</button><button className="btn btn-danger" type="button" onClick={remove}>删除</button></div>
    {history && <div className="memory-history"><div className="row"><h3>修改历史</h3><button className="btn" type="button" onClick={() => setHistory(null)}>收起</button></div>{history.length ? <ol>{history.map((item) => <li key={item.revisionId}><strong>{item.action === 'delete' ? '删除' : '编辑'} · {formatDate(item.createdAt)}</strong><span>{item.reason}</span></li>)}</ol> : <p className="muted">还没有修改记录。</p>}</div>}
  </li>;
}

export default function Memories() {
  const [memories, setMemories] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [scopes, setScopes] = useState([]);
  const [characterId, setCharacterId] = useState('all');
  const [chatId, setChatId] = useState('all');
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const load = async () => { try { const [memoryRows, candidateRows, chatRows] = await Promise.all([listMemories(), listMemoryCandidates(), listChatSummaries()]); setMemories(memoryRows); setCandidates(candidateRows); setScopes(chatRows.filter((row) => row.chat)); } catch (e) { setError(e.message); } };
  useEffect(() => { load(); }, []);
  const characters = useMemo(() => [...new Map(scopes.map((row) => [row.character.id, row.character])).values()], [scopes]);
  const chatsForCharacter = useMemo(() => scopes.filter((row) => characterId === 'all' || String(row.character.id) === characterId), [scopes, characterId]);
  const visible = useMemo(() => (memories || []).filter((m) => {
    const matchesFilter = filter === 'all' || (filter === 'active' ? m.status === MEMORY_STATUSES.ACTIVE : m.status !== MEMORY_STATUSES.ACTIVE);
    const selectedChat = chatId === 'all' || Number(m.chatId) === Number(chatId);
    const selectedCharacter = characterId === 'all' || chatsForCharacter.some((row) => row.chat.id === m.chatId);
    const haystack = `${m.title} ${m.content}`.toLowerCase(); return matchesFilter && selectedChat && selectedCharacter && haystack.includes(query.toLowerCase());
  }), [memories, filter, query, chatId, characterId, chatsForCharacter]);
  const confirmCandidate = async (candidate) => { const memory = await confirmMemoryCandidate(candidate.memoryId); setCandidates((rows) => rows.filter((row) => row.memoryId !== candidate.memoryId)); setMemories((rows) => [memory, ...(rows || [])]); announce(`已确认保存「${memory.title}」。`); };
  const dismissCandidate = async (candidate) => { await dismissMemoryCandidate(candidate.memoryId); setCandidates((rows) => rows.filter((row) => row.memoryId !== candidate.memoryId)); announce(`已忽略「${candidate.title || '这条候选'}」。`); };
  return <Screen title="长期记忆" subtitle="这里的内容只作为聊天参考；你当前说的话永远优先。" backTo="/apps" backLabel="返回应用列表">
    {error && <div className="card" role="alert">读取记忆失败：{error}</div>}
    <section className="memory-overview" aria-label="记忆概况"><strong>{memories?.filter((m) => m.status === MEMORY_STATUSES.ACTIVE).length ?? '—'}</strong><span>使用中</span><strong>{candidates.length}</strong><span>待确认</span><strong>{memories?.filter((m) => m.status !== MEMORY_STATUSES.ACTIVE).length ?? '—'}</strong><span>已停用</span></section>
    {candidates.length > 0 && <section className="candidate-section" aria-labelledby="candidate-title"><div className="section-heading"><h2 id="candidate-title">待确认候选</h2><span>确认后才会参与聊天召回</span></div><ul className="memory-list">{candidates.map((candidate) => <li className="memory-card is-candidate" key={candidate.memoryId}><div className="memory-card-head"><div><span className="memory-kicker">状态：待确认</span><h2>{candidate.title || '未命名候选'}</h2></div><span className="memory-type">{TYPE_LABELS[candidate.type] || '记忆'}</span></div><p className="memory-content">{candidate.content}</p><div className="memory-actions"><button className="btn btn-primary" type="button" onClick={() => confirmCandidate(candidate)}>确认保存</button><button className="btn" type="button" onClick={() => dismissCandidate(candidate)}>忽略</button></div></li>)}</ul></section>}
    <section aria-labelledby="memory-title"><div className="section-heading"><h2 id="memory-title">已保存记忆</h2><span>{visible.length} 条</span></div><div className="memory-controls">
      <div className="memory-scope-grid">
        <div className="field"><label htmlFor="memory-character">选择角色</label><select id="memory-character" className="field-input" value={characterId} onChange={(e) => { setCharacterId(e.target.value); setChatId('all'); }}><option value="all">全部角色</option>{characters.map((character) => <option key={character.id} value={character.id}>{character.name || '未命名角色'}</option>)}</select></div>
        <div className="field"><label htmlFor="memory-chat">选择聊天框</label><select id="memory-chat" className="field-input" value={chatId} onChange={(e) => setChatId(e.target.value)}><option value="all">该角色的全部聊天框</option>{chatsForCharacter.map((row) => <option key={row.chat.id} value={row.chat.id}>{row.dialogName || `对话 ${row.chat.id}`}</option>)}</select></div>
      </div>
      <label htmlFor="memory-search">搜索记忆</label><input id="memory-search" className="field-input" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索标题或内容" /><div className="row" role="group" aria-label="筛选记忆"><button className="btn" aria-pressed={filter === 'all'} type="button" onClick={() => setFilter('all')}>全部</button><button className="btn" aria-pressed={filter === 'active'} type="button" onClick={() => setFilter('active')}>使用中</button><button className="btn" aria-pressed={filter === 'inactive'} type="button" onClick={() => setFilter('inactive')}>已停用</button></div></div>{memories === null ? <p className="muted">正在读取……</p> : visible.length ? <ul className="memory-list">{visible.map((memory) => <MemoryCard key={memory.memoryId} memory={memory} onChange={(next) => setMemories((rows) => next ? rows.map((row) => row.memoryId === next.memoryId ? next : row) : rows.filter((row) => row.memoryId !== memory.memoryId))} />)}</ul> : <div className="card"><h3>还没有符合条件的记忆</h3><p className="muted">和角色聊天后，值得长期参考的内容会先进入待确认候选。</p></div>}</section>
  </Screen>;
}
