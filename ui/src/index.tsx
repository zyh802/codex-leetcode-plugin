import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { invariant } from "./utils/invariant.js";
import "./styles/global.css";

const root = document.getElementById("root");
invariant(root, "Missing application root.");
createRoot(root).render(<App />);
