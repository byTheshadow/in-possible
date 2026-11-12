// src/services/aiService.js
//
// AI 接入：OpenAI 兼容接口。
//   模型列表   GET  {baseUrl}/models
//   生成回复   POST {baseUrl}/chat/completions   （一次拿回整段，不做流式）
// 请求头 Authorization: Bearer {apiKey}。请求直接从浏览器发到用户填的地址。
//
// 设置存在 db.settings 的 apiConfig 里：{ baseUrl, apiKey, model }。
// 密钥只存在这台设备上，不写日志，也不出现在报错文字里。
//
// 所有报错都会变成一句人话的 AiError，界面直接播报。
// kind 取值：aborted（用户点了暂停）、timeout、network、http、format、empty、no-user、config。

import { getSetting, setSetting } from './db';

export const API_CONFIG_KEY = 'apiConfig';
export const DEFAULT_API_CONFIG = { baseUrl: '', apiKey: '', model: '' };

// 交给 AI 的最近消息条数（用户已定：60 条）
export const CONTEXT_LIMIT = 60;
const REPLY_TIMEOUT_MS = 120000;
const MODELS_TIMEOUT_MS = 30000;

export class AiError extends Error {
  constructor(message, kind = 'http') {
    super(message);
    this.name = 'AiError';
    this.kind = kind;
  }
}

export const normalizeBaseUrl = (value) => String(value ?? '').trim().replace(/\/+$/, '');

export const normalizeApiConfig = (raw) => ({
  baseUrl: normalizeBaseUrl(raw?.baseUrl),
  apiKey: String(raw?.apiKey ?? '').trim(),
  model: String(raw?.model ?? '').trim(),
});

export const isApiConfigured = (config) => Boolean(config && config.baseUrl && config.apiKey && config.model);

export const getApiConfig = async () => normalizeApiConfig(await getSetting(API_CONFIG_KEY, null));

export const saveApiConfig = (config) => setSetting(API_CONFIG_KEY, normalizeApiConfig(config));

export const clearApiConfig = () => setSetting(API_CONFIG_KEY, { ...DEFAULT_API_CONFIG });

// ---------- 请求 ----------

const scrub = (text, apiKey) => {
  let out = String(text ?? '');
  if (apiKey) out = out.split(apiKey).join('***');
  return out;
};

const httpError = (status, bodyText, apiKey) => {
  let detail = '';
  try {
    const data = JSON.parse(bodyText);
    detail = data?.error?.message || data?.message || '';
  } catch (e) {
    detail = '';
  }
  detail = scrub(detail, apiKey).trim().slice(0, 120);
  const tail = detail ? `（对方说：${detail}）` : '';

  if (status === 401 || status === 403) return new AiError(`密钥不对，或者这个密钥没有权限。请到设置里的 AI 接入检查密钥。${tail}`, 'http');
  if (status === 404) return new AiError(`找不到这个接口。请检查接口地址，一般要以 /v1 结尾，模型名也要对。${tail}`, 'http');
  if (status === 429) return new AiError(`请求太频繁，或者额度用完了。过一会儿再试，或者检查账户额度。${tail}`, 'http');
  if (status >= 500) return new AiError(`对方的服务出了问题（${status}）。稍后再试。${tail}`, 'http');
  return new AiError(`接口返回了错误（${status}）。${tail}`, 'http');
};

const request = async (url, { method = 'GET', apiKey, body, signal, timeoutMs }) => {
  const controller = new AbortController();
  let timedOut = false;
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    let response;
    let text;
    try {
      response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      text = await response.text();
    } catch (error) {
      if (error?.name === 'AbortError') {
        if (timedOut) throw new AiError(`等了太久没有回应（超过 ${Math.round(timeoutMs / 1000)} 秒）。可以再试一次。`, 'timeout');
        throw new AiError('已暂停', 'aborted');
      }
      throw new AiError('连不上这个地址。可能是网络不通，也可能是地址写错了，或者这个服务不允许网页直接访问（跨域限制）。', 'network');
    }

    if (!response.ok) throw httpError(response.status, text, apiKey);

    try {
      return JSON.parse(text);
    } catch (e) {
      throw new AiError('对方返回的内容读不懂。地址可能填成了网页，应该填接口地址，一般以 /v1 结尾。', 'format');
    }
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
};

// 拉取模型列表，返回排好序的模型名数组
export const fetchModels = async ({ baseUrl, apiKey, signal }) => {
  const url = normalizeBaseUrl(baseUrl);
  const data = await request(`${url}/models`, { apiKey, signal, timeoutMs: MODELS_TIMEOUT_MS });
  const list = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : Array.isArray(data) ? data : [];
  const ids = list
    .map((item) => (typeof item === 'string' ? item : item?.id || item?.name))
    .filter((id) => typeof id === 'string' && id.trim());
  const unique = Array.from(new Set(ids.map((id) => id.trim()))).sort((a, b) => a.localeCompare(b));
  if (unique.length === 0) throw new AiError('接口没有返回任何模型。请检查地址和密钥。', 'format');
  return unique;
};

const readContent = (data) => {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((part) => (typeof part === 'string' ? part : part?.text || '')).join('');
  }
  return '';
};

// 生成一整段回复。signal 用来暂停。
export const requestReply = async ({ config, messages, signal }) => {
  if (!isApiConfigured(config)) throw new AiError('还没填好 AI 接入。', 'config');
  const data = await request(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    apiKey: config.apiKey,
    body: { model: config.model, messages, stream: false },
    signal,
    timeoutMs: REPLY_TIMEOUT_MS,
  });
  const reply = readContent(data).trim();
  if (!reply) throw new AiError('AI 返回了空内容。可以再试一次，或者换一个模型。', 'empty');
  return reply;
};

// ---------- 组装发给 AI 的消息 ----------

const formatNow = (now) => {
  try {
    return new Date(now).toLocaleString('zh-CN', { dateStyle: 'full', timeStyle: 'short' });
  } catch (e) {
    return '';
  }
};

export const buildSystemPrompt = ({ character, chat, userName, now = Date.now() }) => {
  const parts = [`你正在扮演角色“${character?.name || '角色'}”，和用户“${userName || '用户'}”聊天。`];
  if (character?.bio) parts.push(`【角色人设】\n${character.bio}`);
  if (character?.extraNotes) parts.push(`【补充细节】\n${character.extraNotes}`);
  if (chat?.userProfile?.persona) parts.push(`【关于用户】\n${chat.userProfile.persona}`);
  if (chat?.systemPrompt) parts.push(`【本聊天室的总提示】\n${chat.systemPrompt}`);
  if (chat?.reactionGuide) parts.push(`【角色反应指导】\n${chat.reactionGuide}`);
  const clock = formatNow(now);
  if (clock) parts.push(`现在的时间是：${clock}。`);
  parts.push(
    '【回复要求】\n' +
      '用中文，像聊天一样自然地回复，只写要说的话。\n' +
      '不要使用 Emoji 和颜文字：用户用读屏软件，它们会被逐个念出来。\n' +
      '不要使用 Markdown 符号。'
  );
  return parts.join('\n\n');
};

// history：这次要参考的消息（按时间顺序）；allMessages：整个聊天，用来查找被引用的消息。
// 只取最近 CONTEXT_LIMIT 条；连续同一方的消息合并成一条；最后必须是用户的话。
export const buildChatMessages = ({ character, chat, history, allMessages = history, userName, limit = CONTEXT_LIMIT, now = Date.now() }) => {
  const byId = new Map(allMessages.map((message) => [message.id, message]));
  const recent = history.filter((message) => message.role === 'user' || message.role === 'character').slice(-limit);

  const turns = [];
  recent.forEach((message) => {
    const role = message.role === 'user' ? 'user' : 'assistant';
    let content = message.text;
    if (message.quoteOfId != null) {
      const quoted = byId.get(message.quoteOfId);
      if (quoted) {
        const who = quoted.role === 'user' ? userName || '用户' : character?.name || '角色';
        content = `（引用${who}说的：“${quoted.text}”）\n${content}`;
      }
    }
    const last = turns[turns.length - 1];
    if (last && last.role === role) last.content += `\n${content}`;
    else turns.push({ role, content });
  });

  // 有的接口要求第一条是用户的话：截断后开头如果是角色的话，去掉
  while (turns.length > 0 && turns[0].role === 'assistant') turns.shift();

  if (turns.length === 0 || turns[turns.length - 1].role !== 'user') {
    throw new AiError('没有可以回应的用户消息。先发一条消息，再让 TA 回复。', 'no-user');
  }

  return [{ role: 'system', content: buildSystemPrompt({ character, chat, userName, now }) }, ...turns];
};