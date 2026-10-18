import React from "react";
import { createRoot } from "react-dom/client";
import { installStorage } from "./storage.js";
import { seedFromFile } from "./seed.js";
import App from "./App.jsx";
import "./index.css";

// El orden importa: primero el storage, luego los datos, y sólo entonces se monta la app,
// porque los componentes leen window.storage en cuanto montan.
installStorage();
seedFromFile().finally(() => {
  createRoot(document.getElementById("root")).render(<App />);
});
