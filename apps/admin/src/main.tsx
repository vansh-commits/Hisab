import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

function App() {
  const [health, setHealth] = useState("checking…");
  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.text())
      .then(setHealth, (e) => setHealth(String(e)));
  }, []);
  return (
    <main style={{ fontFamily: "system-ui", padding: 24 }}>
      <h1>Hisab Admin</h1>
      <p>API: {health}</p>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
