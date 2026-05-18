import { Component } from "react";

export default class HeadlineMapErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || "Map crashed" };
  }
  componentDidCatch(error, info) {
    console.error("[HeadlineMapErrorBoundary]", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-[#0a0e17] text-amber-400 text-sm px-4 text-center">
          Headline map failed to render. The rest of the page is still usable.
        </div>
      );
    }
    return this.props.children;
  }
}