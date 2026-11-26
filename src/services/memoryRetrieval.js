import { listActiveMemories, markMemoriesUsed, normalizeMemory } from './memoryService';
import { MEMORY_CONFIDENCES, MEMORY_TYPES } from './memoryConstants';

const MAX_ITEMS = 4;
const MAX_CHARS = 1800;
const normalize = (value) => String(value ?? '').toLowerCase();
const tokens = (value) => {
  const source = normalize(value);
  const result = new Set(source.split(/[\s,，。！？；：、“”‘’（）()、/\\|.!?;:\-[\]{}]+/).filter((item) => item.length >= 2));
  (source.match(/[\u4e00-\u9fff]{2,}/g) || []).forEach((chunk) => { for (let i = 0; i < chunk.length - 1; i += 1) result.add(chunk.slice(i, i + 2)); });
  return [...result];
};
const overlap = (left, right) => left.length ? left.filter((token) => right.some((other) => token.includes(other) || other.includes(token))).length / left.length : 0;
const confidence = { [MEMORY_CONFIDENCES.USER_WRITTEN]: 1, [MEMORY_CONFIDENCES.CONFIRMED]: 0.94, [MEMORY_CONFIDENCES.INFERRED]: 0.62, [MEMORY_CONFIDENCES.SUGGESTED]: 0.35 };

const score = (memory, queryTokens) => {
  const memoryTokens = tokens([memory.title, memory.content, ...(memory.topicKeys || [])].join(' '));
  const topic = overlap(queryTokens, memoryTokens);
  const ageDays = Math.max(0, (Date.now() - new Date(memory.updatedAt).getTime()) / 86400000);
  const freshness = Math.max(0, 1 - ageDays / 365);
  const authority = memory.confidence === MEMORY_CONFIDENCES.USER_WRITTEN ? 0.2 : memory.confidence === MEMORY_CONFIDENCES.CONFIRMED ? 0.12 : 0;
  const preference = memory.type === MEMORY_TYPES.PREFERENCE ? 0.06 : 0;
  const fatigue = Math.min(0.3, Number(memory.useCount || 0) * 0.025);
  return topic * 0.68 + (memory.importance / 5) * 0.08 + (confidence[memory.confidence] || 0.35) * 0.06 + freshness * 0.03 + authority + preference - fatigue;
};

export const getChatMemoryContext = async ({ chatId, userText = '', recentMessages = [] }) => {
  const memories = await listActiveMemories(chatId);
  if (!memories.length) return '';
  const query = tokens([userText, ...recentMessages.slice(-6).map((message) => message.text)].join(' '));
  const ranked = memories.map((memory) => ({ memory, value: score(memory, query) })).filter((item) => item.value >= (query.length ? 0.12 : 0.2)).sort((a, b) => b.value - a.value);
  const selected = [];
  let length = 0;
  for (const item of ranked) {
    const memory = normalizeMemory(item.memory);
    const line = `- [${memory.type}] ${memory.title ? `${memory.title}：` : ''}${memory.content}`;
    if (length + line.length > MAX_CHARS) continue;
    selected.push(memory);
    length += line.length;
    if (selected.length >= MAX_ITEMS) break;
  }
  if (!selected.length) return '';
  await markMemoriesUsed(selected);
  return `\n【相关长期记忆】\n以下内容是过去对话中整理出的参考，不一定代表当前事实；如用户当前明确更正，应以当前消息为准。\n${selected.map((memory) => `- [${memory.type}] ${memory.title ? `${memory.title}：` : ''}${memory.content}`).join('\n')}\n`;
};
