import React, { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = {
    hasError: false,
    message: '',
  };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error?.message || 'Unknown application error',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Application render error:', error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 p-6">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-lg">
            <h1 className="text-xl font-bold text-gray-900">
              The application could not load
            </h1>

            <p className="mt-2 text-sm text-gray-600">
              A temporary application file may be outdated.
            </p>

            <p className="mt-3 break-words rounded-lg bg-gray-100 p-3 text-xs text-red-700">
              {this.state.message}
            </p>

            <button
              type="button"
              onClick={this.handleReload}
              className="mt-5 w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white"
            >
              Reload application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
