import db from './db';
import { extractMemoriesFromMessages } from './memoryAiService';
import { createMemory, createMemoryCandidate, ensureMemoryJob, updateMemoryJob } from './memoryService';
import { MEMORY_JOB_STATUSES } from './memoryConstants';

const timers = new Map();
const CHECKPOINT = 30;
const HIGH_PRIORITY = /(记住|以后|请记得|我喜欢|我不喜欢|我习惯|我的名字|我叫|不要再)/;

const getMessagesSince = async (chatId, cursor) => {
  const rows = await db.messages.where('chatId').equals(Number(chatId)).sortBy('id');
  return rows.filter((row) => Number(row.id) > Number(cursor || 0) && (row.role === 'user' || row.role === 'character'));
};

const run = async (chatId) => {
  const job = await ensureMemoryJob(chatId);
  if (job.status === MEMORY_JOB_STATUSES.RUNNING) return;
  const messages = await getMessagesSince(chatId, job.lastProcessedMessageId);
  if (!messages.length) return;
  await updateMemoryJob(chatId, { status: MEMORY_JOB_STATUSES.RUNNING });
  try {
    const result = await extractMemoriesFromMessages({ messages });
    for (const memory of result.memories) await createMemory({ ...memory, chatId });
    for (const candidate of result.candidates.slice(0, 4)) await createMemoryCandidate({ ...candidate, chatId });
    await updateMemoryJob(chatId, { status: MEMORY_JOB_STATUSES.IDLE, lastProcessedMessageId: messages[messages.length - 1].id, retryCount: 0, lastRunAt: new Date().toISOString() });
  } catch (error) {
    await updateMemoryJob(chatId, { status: MEMORY_JOB_STATUSES.FAILED, retryCount: Number(job.retryCount || 0) + 1, lastError: error?.message || '记忆整理失败' });
  }
};

export const scheduleMemoryProcessing = async (chatId, { immediate = false, text = '' } = {}) => {
  const job = await ensureMemoryJob(chatId);
  const messages = await getMessagesSince(chatId, job.lastProcessedMessageId);
  if (!immediate && messages.length < CHECKPOINT && !HIGH_PRIORITY.test(text)) return;
  if (timers.has(Number(chatId))) window.clearTimeout(timers.get(Number(chatId)));
  const delay = immediate || HIGH_PRIORITY.test(text) ? 15_000 : 90_000;
  const timer = window.setTimeout(() => { timers.delete(Number(chatId)); run(chatId).catch(() => {}); }, delay);
  timers.set(Number(chatId), timer);
};

export const processDueMemoryJobs = async () => {
  const jobs = await db.memoryJobs.where('status').anyOf([MEMORY_JOB_STATUSES.PENDING, MEMORY_JOB_STATUSES.FAILED]).toArray();
  for (const job of jobs) await run(job.chatId);
};
