import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CodeApp } from "./CodeApp.jsx";
import "./styles/index.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <CodeApp />
  </StrictMode>,
);
