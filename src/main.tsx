import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Check if this window was opened as a detached DevLog view
const params = new URLSearchParams(window.location.search);
const view = params.get("view");

if (view === "devlog") {
  // Render only the DevLog in this window — it subscribes to Tauri events
  // independently and reads from the shared devLogStore.
  import("./components/DevLogPanel").then(({ DevLogFullPage }) => {
    // The detached window also needs its own event subscription
    import("./hooks/useDevLog").then(({ useDevLog }) => {
      // Wrapper component that runs the useDevLog hook
      function DevLogWindow() {
        useDevLog();
        return <DevLogFullPage />;
      }
      ReactDOM.createRoot(document.getElementById("root")!).render(
        <React.StrictMode>
          <DevLogWindow />
        </React.StrictMode>
      );
    });
  });
} else {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
