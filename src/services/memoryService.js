import db from './db';
import { MEMORY_CONFIDENCES, MEMORY_JOB_STATUSES, MEMORY_STATUSES, MEMORY_SUBJECTS, MEMORY_TYPES } from './memoryConstants';

const now = () => new Date().toISOString();
const text = (value) => String(value ?? '').trim();
const id = (prefix) => `${prefix}_${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;

export const normalizeMemory = (row) => ({
  ...row,
  memoryId: text(row?.memoryId) || id('memory'),
  chatId: Number(row?.chatId),
  type: Object.values(MEMORY_TYPES).includes(row?.type) ? row.type : MEMORY_TYPES.FACT,
  subject: Object.values(MEMORY_SUBJECTS).includes(row?.subject) ? row.subject : MEMORY_SUBJECTS.USER,
  title: text(row?.title),
  content: text(row?.content),
  importance: Math.min(5, Math.max(1, Math.round(Number(row?.importance) || 3))),
  confidence: Object.values(MEMORY_CONFIDENCES).includes(row?.confidence) ? row.confidence : MEMORY_CONFIDENCES.INFERRED,
  status: Object.values(MEMORY_STATUSES).includes(row?.status) ? row.status : MEMORY_STATUSES.ACTIVE,
  sourceMessageIds: Array.isArray(row?.sourceMessageIds) ? row.sourceMessageIds.map(Number).filter(Number.isFinite) : [],
  topicKeys: Array.isArray(row?.topicKeys) ? row.topicKeys.map(text).filter(Boolean).slice(0, 8) : [],
  useCount: Number(row?.useCount) || 0,
  lastUsedAt: row?.lastUsedAt || null,
  createdAt: row?.createdAt || now(),
  updatedAt: row?.updatedAt || now(),
});

export const ensureMemoryJob = async (chatId) => {
  const key = Number(chatId);
  const current = await db.memoryJobs.where('chatId').equals(key).first();
  if (current) return current;
  const job = { chatId: key, status: MEMORY_JOB_STATUSES.IDLE, lastProcessedMessageId: null, retryCount: 0, updatedAt: now() };
  const rowId = await db.memoryJobs.add(job);
  return { ...job, id: rowId };
};

export const listActiveMemories = async (chatId) => (await db.memories.where('chatId').equals(Number(chatId)).toArray())
  .map(normalizeMemory)
  .filter((memory) => [MEMORY_STATUSES.ACTIVE, MEMORY_STATUSES.TEMPORARY].includes(memory.status));

export const listMemories = async (chatId = null) => {
  const rows = chatId == null ? await db.memories.toArray() : await db.memories.where('chatId').equals(Number(chatId)).toArray();
  return rows.map(normalizeMemory).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
};

export const listMemoryCandidates = async (chatId = null) => {
  const rows = chatId == null ? await db.memoryCandidates.toArray() : await db.memoryCandidates.where('chatId').equals(Number(chatId)).toArray();
  return rows.filter((row) => row.status === 'pending').map((row) => normalizeMemory({ ...row, memoryId: row.candidateId, status: MEMORY_STATUSES.TEMPORARY }));
};

export const listMemoryRevisions = async (memoryId) => (
  await db.memoryRevisions.where('memoryId').equals(memoryId).reverse().sortBy('createdAt')
);

export const updateMemory = async (memoryId, patch, reason = '用户在记忆管理页修改。') => {
  const current = await db.memories.where('memoryId').equals(memoryId).first();
  if (!current) throw new Error('找不到这条记忆');
  const before = normalizeMemory(current);
  const next = normalizeMemory({ ...before, ...patch, updatedAt: now() });
  await db.transaction('rw', db.memories, db.memoryRevisions, async () => {
    await db.memories.update(current.id, next);
    await db.memoryRevisions.add({
      revisionId: id('revision'), memoryId, chatId: before.chatId, createdAt: now(), actor: 'user',
      action: 'edit', reason, before, after: next,
    });
  });
  return next;
};

export const setMemoryStatus = async (memoryId, status, reason) => updateMemory(memoryId, { status }, reason);

export const deleteMemory = async (memoryId) => {
  const current = await db.memories.where('memoryId').equals(memoryId).first();
  if (!current) return false;
  await db.transaction('rw', db.memories, db.memoryRevisions, async () => {
    await db.memoryRevisions.add({ revisionId: id('revision'), memoryId, chatId: current.chatId, createdAt: now(), actor: 'user', action: 'delete', reason: '用户删除记忆。', before: current, after: null });
    await db.memories.delete(current.id);
  });
  return true;
};

export const confirmMemoryCandidate = async (candidateId) => {
  const candidate = await db.memoryCandidates.where('candidateId').equals(candidateId).first();
  if (!candidate) throw new Error('找不到这条待确认候选');
  const memory = await createMemory({ ...candidate, confidence: MEMORY_CONFIDENCES.CONFIRMED, status: MEMORY_STATUSES.ACTIVE, memoryId: id('memory') });
  await db.memoryCandidates.update(candidate.id, { status: 'confirmed', updatedAt: now() });
  return memory;
};

export const dismissMemoryCandidate = async (candidateId) => {
  const candidate = await db.memoryCandidates.where('candidateId').equals(candidateId).first();
  if (!candidate) return false;
  await db.memoryCandidates.update(candidate.id, { status: 'dismissed', updatedAt: now() });
  return true;
};

export const createMemory = async (input) => {
  const record = normalizeMemory({ ...input, memoryId: input.memoryId || id('memory'), createdAt: input.createdAt || now(), updatedAt: now() });
  const rowId = await db.memories.add(record);
  return { ...record, id: rowId };
};

export const createMemoryCandidate = async (input) => {
  const candidate = { candidateId: input.candidateId || id('candidate'), chatId: Number(input.chatId), status: 'pending', updatedAt: now(), createdAt: now(), ...input };
  const rowId = await db.memoryCandidates.add(candidate);
  return { ...candidate, id: rowId };
};

export const getMemoryJob = (chatId) => ensureMemoryJob(chatId);

export const updateMemoryJob = async (chatId, patch) => {
  const job = await ensureMemoryJob(chatId);
  const next = { ...job, ...patch, updatedAt: now() };
  await db.memoryJobs.update(job.id, next);
  return next;
};

export const markMemoriesUsed = async (memories = []) => {
  const timestamp = now();
  await db.transaction('rw', db.memories, async () => {
    for (const item of memories) {
      const row = await db.memories.get(item.id);
      if (!row || ![MEMORY_STATUSES.ACTIVE, MEMORY_STATUSES.TEMPORARY].includes(row.status)) continue;
      await db.memories.update(row.id, { lastUsedAt: timestamp, useCount: Number(row.useCount) + 1, updatedAt: timestamp });
    }
  });
};
