import { Component } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error("AppErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5 px-6 text-center">
          <div className="w-14 h-14 rounded-full bg-destructive/10 border border-destructive/30 flex items-center justify-center">
            <AlertTriangle className="w-7 h-7 text-destructive" />
          </div>
          <div>
            <h2 className="font-heading font-bold text-xl text-foreground mb-2">Something went wrong</h2>
            <p className="text-muted-foreground text-sm max-w-sm">
              An unexpected error occurred on this page. Your data is safe — try refreshing to continue.
            </p>
            {this.state.error?.message && (
              <p className="mt-2 text-xs font-mono text-muted-foreground/70 bg-muted px-3 py-1.5 rounded-md max-w-sm mx-auto truncate">
                {this.state.error.message}
              </p>
            )}
          </div>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}