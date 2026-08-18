import React, { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  props: Props;
  state: State = {
    hasError: false,
    error: null,
  };

  constructor(props: Props) {
    super(props);
    this.props = props;
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  private handleReset = () => {
    try {
      localStorage.removeItem('viewStack');
    } catch {}
    window.location.reload();
  };

  private handleClearAll = () => {
    try {
      localStorage.clear();
    } catch {}
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full flex items-center justify-center bg-[#F2F2F7] dark:bg-[#000000] p-4 text-text font-sans">
          <div className="max-w-md w-full bg-white dark:bg-[#1C1C1E] border border-gray-100 dark:border-zinc-800 rounded-3xl p-6 shadow-2xl text-center space-y-4 animate-fade-in">
            <div className="w-14 h-14 bg-red-500/10 text-red-500 rounded-2xl flex items-center justify-center mx-auto border border-red-500/20">
              <AlertTriangle className="w-7 h-7" />
            </div>

            <div className="space-y-1">
              <h2 className="text-lg font-black text-text">Sistem Menghadapi Ralat / System Error</h2>
              <p className="text-xs text-subtext leading-relaxed">
                Aplikasi mengalami masalah kecil semasa memuatkan paparan. Sila muat semula untuk kembali ke laman utama.
              </p>
            </div>

            {this.state.error && (
              <div className="p-3 bg-gray-50 dark:bg-zinc-900 rounded-xl text-left font-mono text-[11px] text-red-600 dark:text-red-400 overflow-x-auto max-h-32 border border-gray-200 dark:border-zinc-800">
                {this.state.error.message || 'Unknown render error'}
              </div>
            )}

            <div className="space-y-2 pt-2">
              <button
                onClick={this.handleReset}
                className="w-full bg-primary hover:bg-primary/90 text-white font-bold text-sm py-3 px-4 rounded-xl shadow-md flex items-center justify-center space-x-2 active:scale-95 transition-all cursor-pointer"
              >
                <RefreshCcw className="w-4 h-4" />
                <span>Muat Semula / Reload App</span>
              </button>

              <button
                onClick={this.handleClearAll}
                className="w-full bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-subtext font-bold text-xs py-2.5 px-4 rounded-xl active:scale-95 transition-all cursor-pointer"
              >
                Kosongkan Cache & Reset
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
