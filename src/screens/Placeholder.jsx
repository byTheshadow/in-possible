// src/screens/Placeholder.jsx
import Screen from '../components/Screen';
import { navigate, safeFrom, useRoute } from '../services/router';

// “还在建设中”：还没做的功能都指到这里，如实告诉用户。
export default function Placeholder() {
  const { query } = useRoute();
  const name = query.get('name') || '这个功能';
  const from = safeFrom(query.get('from'));

  return (
    <Screen
      title={`${name}：还在建设中`}
      docTitle={`${name}（建设中）`}
      actions={
        <button type="button" className="btn btn-primary btn-block" onClick={() => navigate(from)}>
          返回
        </button>
      }
    >
      <div className="card stack">
        <p>{name}还没有做好，现在不能使用。</p>
        <p className="muted">你的数据和其他功能不受影响。</p>
      </div>
    </Screen>
  );
}