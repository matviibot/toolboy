import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { requestPersistentStorage } from "./runtime/persist";
import "./styles/index.css";

// Fire-and-forget: ask for the non-evictable storage bucket before the first render
// so favourites and tool storage aren't garbage collected out from under the user.
void requestPersistentStorage();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
