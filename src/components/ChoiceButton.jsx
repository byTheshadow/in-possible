// src/components/ChoiceButton.jsx

// 一组选项里的一个按钮（配色、字号、开关等）。
// 选中状态不只靠颜色：读屏读“已选中”，屏幕上有粗边框，并且多一段“（当前）”文字。
export default function ChoiceButton({ selected, onClick, children }) {
  return (
    <button type="button" className="btn" aria-pressed={selected} onClick={onClick}>
      {children}
      {selected && <span aria-hidden="true">（当前）</span>}
    </button>
  );
}