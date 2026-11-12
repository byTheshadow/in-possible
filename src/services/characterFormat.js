// src/services/characterFormat.js
//
// 角色导出文件的格式、读取和改名规则。这个文件不碰数据库、不碰浏览器接口，只处理纯数据，
// 这样可以在沙箱里直接用 node 测。读写数据库的部分在 characterService.js。
//
// 本站自己的角色导出文件（JSON）：
// {
//   "format": "in-possible-character",
//   "version": 1,
//   "exportedAt": "2026-11-12T03:00:00.000Z",
//   "characters": [
//     { "name": "小岚", "bio": "详细人设", "extraNotes": "补充细节", "avatar": "data:image/jpeg;base64,..." 或 null }
//   ]
// }
// 不导出的内容：世界书、知识库挂载（现在没有界面）、语音设置（可能带密钥）、对话和消息（对话是用户和角色之间的私人记录）。
// 导入只认这个格式。别的软件的角色卡、旧站的备份都不读，读不了会如实告诉用户。

export const EXPORT_FORMAT = 'in-possible-character';
export const EXPORT_VERSION = 1;

export const NAME_MAX = 30;
export const TEXT_MAX = 20000;
export const IMPORT_MAX_BYTES = 10 * 1024 * 1024;
export const IMPORT_MAX_CHARACTERS = 50;
const AVATAR_DATA_MAX_CHARS = 600 * 1024;
const AVATAR_PATTERN = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/;

// 去掉首尾空白，按字（不是按字节）截断到最大长度
export const clipText = (value, max) => {
  const text = typeof value === 'string' ? value : '';
  const chars = Array.from(text);
  return chars.length > max ? chars.slice(0, max).join('') : text;
};

export const cleanName = (value) => clipText(typeof value === 'string' ? value.trim() : '', NAME_MAX).trim();

// 文件名里不能出现的字符去掉；名字全被去光就叫“角色”
export const exportFileName = (name) => {
  const safe = Array.from(String(name || ''))
    .filter((ch) => !/[\\/:*?"<>|]/.test(ch) && ch.charCodeAt(0) >= 32)
    .join('')
    .trim()
    .slice(0, 30);
  return `零极限角色-${safe || '角色'}.json`;
};

// 读导出文件的文字。读不了就抛出带人话的错误，页面直接念给用户。
// 返回 { items, skipped, truncated, badAvatars }：
//   items        能导入的角色 [{ name, bio, extraNotes, avatar }]（avatar 是 data 地址或 null）
//   skipped      因为没有名字或格式不对而跳过的条数
//   truncated    因为太长被截断的字段个数
//   badAvatars   头像格式不对或太大、已经不要了的个数（角色本身照常导入）
export const parseImportText = (text) => {
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error('这个文件读不出内容，不是正确的角色文件。请选本站导出的角色文件');
  }
  if (!data || typeof data !== 'object' || data.format !== EXPORT_FORMAT) {
    throw new Error('这不是零极限的角色文件。现在只能导入本站自己导出的角色文件');
  }
  const version = Number(data.version);
  if (!Number.isFinite(version) || version < 1) {
    throw new Error('这个角色文件的版本号不对，读不了');
  }
  if (version > EXPORT_VERSION) {
    throw new Error('这个角色文件来自更新的版本，现在的版本读不了。请先更新应用');
  }
  if (!Array.isArray(data.characters)) {
    throw new Error('这个角色文件里没有角色');
  }
  if (data.characters.length > IMPORT_MAX_CHARACTERS) {
    throw new Error(`一个文件里最多导入 ${IMPORT_MAX_CHARACTERS} 个角色，这个文件有 ${data.characters.length} 个`);
  }

  const items = [];
  let skipped = 0;
  let truncated = 0;
  let badAvatars = 0;

  data.characters.forEach((raw) => {
    if (!raw || typeof raw !== 'object') {
      skipped += 1;
      return;
    }
    const name = cleanName(raw.name);
    if (!name) {
      skipped += 1;
      return;
    }
    const textField = (value) => {
      const text = typeof value === 'string' ? value : '';
      const clipped = clipText(text, TEXT_MAX);
      if (clipped.length !== text.length) truncated += 1;
      return clipped;
    };
    let avatar = null;
    if (raw.avatar !== null && raw.avatar !== undefined && raw.avatar !== '') {
      if (typeof raw.avatar === 'string' && raw.avatar.length <= AVATAR_DATA_MAX_CHARS && AVATAR_PATTERN.test(raw.avatar)) {
        avatar = raw.avatar;
      } else {
        badAvatars += 1;
      }
    }
    items.push({ name, bio: textField(raw.bio), extraNotes: textField(raw.extraNotes), avatar });
  });

  if (items.length === 0) {
    throw new Error(skipped > 0 ? `文件里的 ${skipped} 个角色都没有名字或格式不对，没有可以导入的` : '这个角色文件里没有角色');
  }
  return { items, skipped, truncated, badAvatars };
};

// 给导入的角色定最终的名字：和已有的角色（或同一批里前面的角色）重名，就在后面加（2）、（3）……
// 返回和 items 一一对应的数组，每项多出 finalName 和 renamed。
export const assignNames = (items, takenNames) => {
  const taken = new Set(takenNames);
  return items.map((item) => {
    let finalName = item.name;
    if (taken.has(finalName)) {
      let n = 2;
      for (;;) {
        const suffix = `（${n}）`;
        const base = Array.from(item.name)
          .slice(0, Math.max(1, NAME_MAX - Array.from(suffix).length))
          .join('');
        finalName = `${base}${suffix}`;
        if (!taken.has(finalName)) break;
        n += 1;
      }
    }
    taken.add(finalName);
    return { ...item, finalName, renamed: finalName !== item.name };
  });
};