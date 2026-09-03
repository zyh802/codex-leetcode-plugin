import { Component, type ErrorInfo, type PropsWithChildren, type ReactNode } from "react";

interface ErrorBoundaryState { error: Error | null }

export class ErrorBoundary extends Component<PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // Rendering errors stay local. Sensitive request state is intentionally not logged.
  }

  render(): ReactNode {
    if (this.state.error) {
      return <div className="app-error"><section><h1>页面暂时无法显示</h1><p>请重新打开本地力扣题库。代码文件和题库数据没有被删除。</p></section></div>;
    }
    return this.props.children;
  }
}
