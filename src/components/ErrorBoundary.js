import { Component, createRef } from 'react';
import { announce } from '../services/announcer';

// 模块崩溃隔离：一个区域出错，只替换这个区域，其余部分继续可用。
// 用法：<ErrorBoundary label="聊天室">...</ErrorBoundary>
// 出错时会立即播报，并把焦点移到错误标题上，用户不需要自己去找。
export default class ErrorBoundary extends Component {
  state = { error: null };

  headingRef = createRef();

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    const label = this.props.label || '这个页面';
    console.error(`[ErrorBoundary:${label}]`, error);
    announce(`${label}出错了。你可以点重试，或者重新加载。`, { assertive: true });
  }

  componentDidUpdate(_prevProps, prevState) {
    if (!prevState.error && this.state.error && this.headingRef.current) {
      this.headingRef.current.focus();
    }
  }

  reset = () => {
    this.setState({ error: null });
    announce('正在重试');
  };

  reload = () => {
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const label = this.props.label || '这个页面';
    return (
      <section className="card stack" role="group" aria-labelledby="eb-title" style={{ margin: '1rem' }}>
        <h2 id="eb-title" ref={this.headingRef} tabIndex={-1}>
          {label}出错了
        </h2>
        <p>其他部分不受影响。你的数据还在。</p>
        <p className="muted">错误信息：{String(error?.message || error)}</p>
        <div className="row">
          <button type="button" className="btn btn-primary" onClick={this.reset}>
            重试
          </button>
          <button type="button" className="btn" onClick={this.reload}>
            重新加载
          </button>
        </div>
      </section>
    );
  }
}
