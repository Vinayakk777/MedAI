import React from "react";
import { motion } from "framer-motion";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface State { hasError: boolean; error: Error | null }

class ErrorBoundaryClass extends React.Component<React.PropsWithChildren<{ fallback?: React.ReactNode }>, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[ErrorBoundary]", error, info.componentStack);
    }
  }

  handleRetry = () => this.setState({ hasError: false, error: null });

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className="min-h-screen bg-background flex items-center justify-center px-4"
      >
        <div className="max-w-md text-center">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto mb-6">
            <AlertTriangle className="w-7 h-7 text-rose-400" />
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Something went wrong</h2>
          <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
            An unexpected error occurred. Your data is safe — refresh the page to continue.
          </p>
          {this.state.error && (
            <pre className="text-left text-[10px] bg-card border border-white/5 rounded-xl p-4 text-rose-400/80 overflow-auto mb-6 max-h-48">
              {this.state.error.message}
              {"\n\n"}
              {this.state.error.stack}
            </pre>
          )}
          <button
            onClick={this.handleRetry}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Try again
          </button>
        </div>
      </motion.div>
    );
  }
}

export function ErrorBoundary({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  return <ErrorBoundaryClass fallback={fallback}>{children}</ErrorBoundaryClass>;
}
