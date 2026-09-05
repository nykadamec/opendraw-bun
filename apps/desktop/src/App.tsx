import { useState, useEffect } from 'react';
import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { Sparkles, Gallery, Folder, Settings, Layout } from 'reicon-react';
import PuzzlePiece from 'reicon-react/icons/PuzzlePiece';
import { fetchEcho } from '@opendraw/api-client';
import {
  GeneratePage,
  GalleryPage,
  ProjectsPage,
  LorasPage,
  CanvasPage,
  CanvasProjectsPage,
  SettingsPage,
  useFeatureFlag,
} from '@opendraw/ui';
import { ThemeProvider } from '@opendraw/config-theme';
import { ChevronLeft, ChevronRight } from 'reicon-react';

const iconSize = 20;

const ECHO_POLL_MS = 30000;

function ConnectionDot() {
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        await fetchEcho();
        if (!cancelled) setConnected(true);
      } catch {
        if (!cancelled) setConnected(false);
      }
    };
    check();
    const timer = window.setInterval(check, ECHO_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const tooltip =
    connected === null
      ? 'Zjišťuji stav Draw Things…'
      : connected
        ? 'Draw Things připojen – gRPC most běží'
        : 'Draw Things není připojen – zkontroluj, že běží Draw Things a gRPC most';

  return (
    <span
      data-el-name="SidebarConnectionDot"
      role="status"
      title={tooltip}
      aria-label={tooltip}
      className={`w-2 h-2 rounded-full flex-shrink-0 transition-colors duration-300 ${
        connected === null
          ? 'bg-txt-tertiary/40 animate-pulse'
          : connected
            ? 'bg-green-500'
            : 'bg-red-500 animate-pulse'
      }`}
    />
  );
}

function SidebarBrand() {
  return (
    <div data-el-name="SidebarHeader" className="px-5 pt-5 pb-4">
      <div className="flex items-center gap-2">
        <h1 data-el-name="AppTitle" className="text-base font-semibold text-txt-primary tracking-tight">OpenDraw</h1>
        <ConnectionDot />
      </div>
    </div>
  );
}

function NavIcon({
  path, label, icon: Icon, disabled, tooltip,
}: NavItem) {
  if (disabled) {
    return (
      <div
        data-el-name={`NavLink_${label}`}
        title={tooltip}
        className="flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-sm text-txt-secondary/40 cursor-not-allowed select-none opacity-20"
      >
        <span data-el-name="NavIcon" className="w-5 h-5 shrink-0 flex items-center justify-center">
          <Icon size={iconSize} />
        </span>
        <span data-el-name={`NavLabel_${label}`}>{label}</span>
      </div>
    );
  }
  return (
    <NavLink data-el-name={`NavLink_${label}`}
      to={path}
      end={path === '/'}
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg text-sm transition-colors ${
          isActive
            ? 'bg-txt-primary/10 backdrop-blur-sm text-txt-primary border-l-2 border-txt-primary'
            : 'text-txt-secondary hover:text-txt-primary hover:bg-surface'
        }`
      }
    >
      <span data-el-name="NavIcon" className="w-5 h-5 shrink-0 flex items-center justify-center">
        <Icon size={iconSize} />
      </span>
      <span data-el-name={`NavLabel_${label}`}>{label}</span>
    </NavLink>
  );
}

interface NavItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  disabled?: boolean;
  tooltip?: string;
}

const NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'Generovat', icon: Sparkles },
  { path: '/canvas', label: 'Canvas', icon: Layout, disabled: true, tooltip: 'Již brzy' },
  { path: '/gallery', label: 'Galerie', icon: Gallery },
  { path: '/projects', label: 'Projekty', icon: Folder },
  { path: '/loras', label: 'LoRA', icon: PuzzlePiece },
  { path: '/settings', label: 'Nastavení', icon: Settings },
];

function App() {
  const location = useLocation();
  const isGeneratePage = location.pathname === '/';
  const isCanvasPage = location.pathname.startsWith('/canvas');
  const [canvasgen2] = useFeatureFlag('canvasgen2', false);

  const [sidebarVisible, setSidebarVisible] = useState(() => {
    if (typeof window === 'undefined') return true;
    try {
      const saved = localStorage.getItem('opendraw.sidebarVisible');
      return saved !== null ? saved === 'true' : true;
    } catch { return true; }
  });

  useEffect(() => {
    try { localStorage.setItem('opendraw.sidebarVisible', String(sidebarVisible)); }
    catch {}
  }, [sidebarVisible]);

  return (
    <ThemeProvider>
      <div data-el-name="AppLayout" className={`h-full ${canvasgen2 ? '' : 'flex flex-row'}`}>
        {canvasgen2 ? (
          <aside data-el-name="DesktopSidebar"
            className={`fixed left-4 top-4 z-30 h-[calc(100vh-32px)] w-60 overflow-y-auto scrollbar-none
              rounded-2xl transition-all duration-300 ease-in-out
              ${isGeneratePage || isCanvasPage
                ? 'bg-canvas/30 backdrop-blur-2xl shadow-2xl'
                : 'bg-surface border border-border shadow-xl panel-surface'
              }
              ${sidebarVisible ? 'translate-x-0' : '-translate-x-full'}`}
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
          >
            <SidebarBrand />
            <nav data-el-name="SidebarNav" className="flex-1 flex flex-col gap-1 py-2">
              {NAV_ITEMS.map((item) => (
                <NavIcon key={item.path} {...item} />
              ))}
            </nav>
          </aside>
        ) : (
          <aside data-el-name="DesktopSidebar" className="flex flex-col w-60 shrink-0 bg-canvas/60 backdrop-blur-xl border-r border-border">
            <SidebarBrand />
            <nav data-el-name="SidebarNav" className="flex-1 flex flex-col gap-1 py-2">
              {NAV_ITEMS.map((item) => (
                <NavIcon key={item.path} {...item} />
              ))}
            </nav>
          </aside>
        )}
        <main data-el-name="MainContent" className={`overflow-y-auto ${canvasgen2 ? 'h-full w-full' : 'flex-1'}`}>
          <Routes>
            <Route path="/" element={<GeneratePage />} />
            <Route path="/gallery" element={<GalleryPage />} />
            <Route path="/canvas" element={<CanvasProjectsPage />} />
            <Route path="/canvas/:id" element={<CanvasPage />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/loras" element={<LorasPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>

        {canvasgen2 && (sidebarVisible ? (
          <button data-el-name="SidebarHideButton"
            onClick={() => setSidebarVisible(false)}
            className={`fixed top-1/2 z-30 w-8 h-16 rounded-r-lg
              flex items-center justify-center text-txt-secondary hover:text-txt-primary active:bg-border transition-colors
              ${isGeneratePage || isCanvasPage
                ? 'bg-canvas/30 backdrop-blur-xl shadow-lg'
                : 'bg-surface border border-border shadow-lg'
              }`}
            style={{ left: 'calc(240px + 16px)', transform: 'translateY(-50%)' }}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        ) : (
          <button data-el-name="SidebarToggle"
            onClick={() => setSidebarVisible(true)}
            className={`fixed left-4 top-1/2 -translate-y-1/2 z-30 w-8 h-16 rounded-r-lg
              flex items-center justify-center text-txt-secondary hover:text-txt-primary active:bg-border transition-colors
              ${isGeneratePage || isCanvasPage
                ? 'bg-canvas/30 backdrop-blur-xl shadow-lg'
                : 'bg-surface border border-border shadow-lg'
              }`}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        ))}
      </div>
    </ThemeProvider>
  );
}

export default App;
