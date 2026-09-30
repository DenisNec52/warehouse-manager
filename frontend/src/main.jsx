import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import { LazyMotion } from "framer-motion";

// Le funzioni di animazione arrivano in un file separato, dopo il primo render
const loadMotionFeatures = () => import("./lib/motionFeatures.js").then(m => m.default);
import App from "./App.jsx";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:           1000 * 60 * 3,
      retry:               1,
      refetchOnWindowFocus:false,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {/* Solo le funzioni di animazione usate (animate/exit/varianti), non tutto framer-motion.
        strict: un "motion" completo importato per errore fa scattare un errore in sviluppo */}
    <LazyMotion features={loadMotionFeatures} strict>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: { fontFamily:"Inter,sans-serif", fontSize:13, borderRadius:"var(--radius)" },
            success: { iconTheme: { primary:"var(--brand-500)", secondary:"white" } },
          }}
        />
      </BrowserRouter>
    </QueryClientProvider>
    </LazyMotion>
  </React.StrictMode>
);
