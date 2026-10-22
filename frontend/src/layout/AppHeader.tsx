import { Link } from "react-router";
import { ThemeToggleButton } from "../components/common/ThemeToggleButton";
import { useSidebar } from "../context/SidebarContext";

const AppHeader: React.FC = () => {
  const { isMobileOpen, toggleSidebar, toggleMobileSidebar } = useSidebar();

  const handleToggle = () => {
    if (window.innerWidth >= 1024) toggleSidebar();
    else toggleMobileSidebar();
  };

  return (
    <>
      {/* Header */}
      <header className="sticky top-0 z-50 flex h-16 w-full items-center border-b border-[#006875] bg-[#00505C] px-3 sm:px-5 lg:h-[72px] lg:px-6">
        {/* Sidebar toggle button */}
        <button
          type="button"
          onClick={handleToggle}
          aria-label={isMobileOpen ? "Close navigation" : "Open navigation"}
          className="grid size-10 place-items-center rounded-xl border border-[#1595A1] bg-[#004E59] text-white transition-colors hover:border-[#18C8D6] hover:bg-[#007681]"
        >
          <span className="text-xl leading-none">
            {isMobileOpen ? "×" : "☰"}
          </span>
        </button>

        {/* Mobile logo - visible only on mobile */}
        <Link
          to="/dashboard"
          className="ml-3 flex min-w-0 items-center gap-3 lg:hidden"
        >
          <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-[#008DFF] via-[#00C83C] to-[#FFAB2E] text-sm font-black text-white shadow-lg">
            U
          </span>

          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-white">
              USDT BOSS
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#7FD3D9]">
              Income Network
            </p>
          </div>
        </Link>

        {/* Right side - Network status & Theme toggle */}
        <div className="ml-auto flex items-center gap-3">
          {/* Network status - hidden on mobile */}
          <div className="hidden items-center gap-2 rounded-full border border-[#1595A1] bg-[#004E59] px-3 py-1.5 text-xs font-semibold text-white sm:flex">
            <span className="size-2 rounded-full bg-[#00E676] shadow-[0_0_8px_#00E676]" />
            EVM Testnet
          </div>

          {/* Theme toggle */}
          <ThemeToggleButton />
        </div>
      </header>

      {/* Line break with gradient color */}
      <br />
      <br />
      <div className="h-[2px] w-full bg-gradient-to-r from-[#008DFF] via-[#00C83C] to-[#FFAB2E]" />
    </>
  );
};

export default AppHeader;
