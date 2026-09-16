import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import { Toaster } from "react-hot-toast";
import "react-toastify/dist/ReactToastify.css";
const rootEl = document.getElementById("root");

if (!rootEl) {
  throw new Error('Missing root element with id="root" in HTML');
}

const root = createRoot(rootEl);

root.render(
  <React.StrictMode>
    <App />
    <Toaster position="top-right" />
  </React.StrictMode>
);