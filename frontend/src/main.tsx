import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "swiper/swiper-bundle.css";
import "flatpickr/dist/flatpickr.css";
import App from "./App.tsx";
import { AppWrapper } from "./components/common/PageMeta.tsx";
import { ThemeProvider } from "./context/ThemeContext.tsx";
import { initializeEvm } from "./evm/client";

// The app used to render only after initializeEvm() resolved. That call makes
// several RPC round trips, so a slow or rate-limited endpoint left the user
// looking at an empty page for the full RPC timeout with nothing on screen.
// Boot renders a loading screen immediately and gives the chain lookup a short
// budget; if it overruns, the app starts anyway and remounts once the lookup
// lands so DEFAULT_REFERRER driven state picks up the real value.
const BOOT_BUDGET_MS = 2500;

let bootPromise: Promise<void> | undefined;
const boot = () => (bootPromise ??= initializeEvm());

function BootScreen() {
  return (
    <div className="boot-screen">
      <img className="boot-logo" src="/web_assets/logo.png" alt="USDT Boss" />
      <div className="boot-bar"><span /></div>
      <p className="boot-text">Connecting to the network...</p>
      <style>{`
        .boot-screen {
          position: fixed;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 18px;
          background: #050505;
color: #ffffff;
          font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
        }
        .boot-logo {
          width: 120px;
          height: auto;
          border-radius: 10px;
          filter: drop-shadow(0 0 12px rgba(255, 190, 40, 0.35));
        }
        .boot-bar {
          width: 180px;
          height: 3px;
          overflow: hidden;
          background: rgba(255, 255, 255, 0.12);
          border-radius: 3px;
        }
        .boot-bar span {
          display: block;
          width: 40%;
          height: 100%;
          border-radius: 3px;
          background: linear-gradient(90deg, #ffd35a, #e0a52a);
          animation: boot-slide 1.1s ease-in-out infinite;
        }
        @keyframes boot-slide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(350%); }
        }
        .boot-text {
          margin: 0;
          color: #a9a9a9;
          font-size: 12.5px;
          letter-spacing: 0.3px;
        }
      `}</style>
    </div>
  );
}

function Boot() {
  const [ready, setReady] = useState(false);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let overran = false;

    const budget = setTimeout(() => {
      if (cancelled) return;
      overran = true;
      setReady(true);
    }, BOOT_BUDGET_MS);

    void boot().finally(() => {
      clearTimeout(budget);
      if (cancelled) return;
      // Started without the chain lookup: remount so state seeded from
      // DEFAULT_REFERRER is rebuilt with the resolved value.
      if (overran) setGeneration((g) => g + 1);
      setReady(true);
    });

    return () => {
      cancelled = true;
      clearTimeout(budget);
    };
  }, []);

  if (!ready) return <BootScreen />;
  return <App key={generation} />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <AppWrapper>
        <Boot />
      </AppWrapper>
    </ThemeProvider>
  </StrictMode>,
);
