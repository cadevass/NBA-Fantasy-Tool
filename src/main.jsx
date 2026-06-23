import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { SleeperProvider } from "./context/SleeperContext";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <SleeperProvider>
      <App />
    </SleeperProvider>
  </React.StrictMode>
);
