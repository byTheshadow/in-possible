# in-possible 零极限

面向视障和低视力用户的角色陪伴 PWA。技术栈：React 18、Vite、Dexie（IndexedDB）。

## 运行

```
npm install
npm run dev
```

## 目录

- `src/styles/tokens.css`：两套配色和设计变量（取自定稿的视觉原型）
- `src/styles/base.css`：基础样式、焦点环、按钮、读屏专用类
- `src/services/db.js`：数据库骨架
- `src/services/accessibilityService.js`：主题、字号、大按钮、单手模式
- `src/services/announcer.js`、`src/components/Announcer.jsx`：读屏播报
- `src/components/ErrorBoundary.jsx`：模块崩溃隔离
- `src/App.jsx`：临时的“地基检查”页，阶段 1 会被替换

## 规则

- 零 Emoji：代码、界面、注释、默认配置里都不出现。
- 每个新功能过一遍无障碍清单；没在真机读屏上验证过的行为，不说“已验证”。
- 新字段优先用不建索引的加法，并提供默认值。
