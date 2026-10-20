import { Component, type ReactNode } from 'react';
import KyButton from './ui/KyButton';

interface Props { children: ReactNode; }
interface State { hasError: boolean; }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error('Portal render error', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="text-center">
            <h1 className="text-2xl font-extrabold text-gray-800">Something went wrong</h1>
            <p className="mt-2 text-sm text-gray-500 max-w-sm mx-auto">
              An unexpected error occurred. Your data is safe — reload to continue where you left off.
            </p>
            <KyButton className="mt-6" onClick={() => window.location.reload()}>Reload Portal</KyButton>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
