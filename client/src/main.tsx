import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "./router";
import "./styles.css";

// #root is a static element in index.html.
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
