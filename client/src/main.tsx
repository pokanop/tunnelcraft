import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

// #root is a static element in index.html.
createRoot(document.getElementById("root")!).render(<App />);
