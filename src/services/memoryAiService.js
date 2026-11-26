import { getApiConfig, isApiConfigured, requestReply } from './aiService';
import { MEMORY_CONFIDENCES, MEMORY_SUBJECTS, MEMORY_TYPES } from './memoryConstants';

const EXTRACTION_PROMPT = `你是本地陪伴应用的记忆整理模块。请从给定的聊天片段中提取少量值得长期保留的信息。
只提取明确、稳定、有帮助的内容，不要把一次性的情绪、闲聊或猜测当成事实。
角色的核心身份不由这里改写；角色想法、关系理解和用户事实要区分开。
只输出 JSON 对象，不要 Markdown，格式为：
{"memories":[{"type":"fact|preference|episode|relationship|character_thought|emotion|expression_rule|character_action|belief","subject":"user|character|relationship|shared","title":"简短标题","content":"第三人称或中性表述","importance":1,"confidence":"inferred|suggested|confirmed"}],"candidates":[]}
最多输出 4 条 memories。没有值得记录的内容就输出空数组。`;

const parseJson = (text) => {
  const clean = String(text || '').trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  try { return JSON.parse(clean); } catch (error) {
    const match = clean.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : { memories: [], candidates: [] };
  }
};

export const extractMemoriesFromMessages = async ({ messages }) => {
  const config = await getApiConfig();
  if (!isApiConfigured(config) || !messages.length) return { memories: [], candidates: [] };
  const transcript = messages.map((message) => `${message.role === 'user' ? '用户' : '角色'}：${message.text}`).join('\n');
  const result = await requestReply({ config, messages: [{ role: 'system', content: EXTRACTION_PROMPT }, { role: 'user', content: transcript }], signal: undefined });
  const parsed = parseJson(result);
  return {
    memories: (Array.isArray(parsed.memories) ? parsed.memories : []).slice(0, 4).map((item) => ({
      type: Object.values(MEMORY_TYPES).includes(item.type) ? item.type : MEMORY_TYPES.FACT,
      subject: Object.values(MEMORY_SUBJECTS).includes(item.subject) ? item.subject : MEMORY_SUBJECTS.USER,
      title: String(item.title || '').trim(), content: String(item.content || '').trim(), importance: Number(item.importance) || 3,
      confidence: Object.values(MEMORY_CONFIDENCES).includes(item.confidence) ? item.confidence : MEMORY_CONFIDENCES.INFERRED,
      sourceMessageIds: messages.map((message) => message.id).filter(Number.isFinite),
    })).filter((item) => item.content),
    candidates: Array.isArray(parsed.candidates) ? parsed.candidates : [],
  };
};
