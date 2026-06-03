import { Component } from "react";
import StateScreen from "./StateScreen.jsx";

// Catches render-time crashes anywhere below it and shows a recoverable screen instead of
// a blank white page.
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[ui] render error:", error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="container">
          <StateScreen
            tone="bad"
            icon="!"
            title="Something went wrong"
            body="The interface hit an unexpected error. Reloading usually fixes it."
            actions={
              <button className="btn btn-primary" type="button" onClick={() => window.location.reload()}>
                Reload
              </button>
            }
          />
        </main>
      );
    }
    return this.props.children;
  }
}
