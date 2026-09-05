import { Routes, Route, NavLink } from 'react-router-dom';
import {
  WandSparkle,
  Gallery as GalleryIcon,
  Folder as FolderIcon,
  PuzzlePiece as LoraIcon,
  Gear as SettingsIcon,
} from 'reicon-react';
import {
  GeneratePage,
  GalleryPage,
  ProjectsPage,
  LorasPage,
  SettingsPage,
} from '@opendraw/ui';
import { ThemeProvider } from '@opendraw/config-theme';

const NAV_ITEMS = [
  { path: '/', label: 'Generovat', Icon: WandSparkle },
  { path: '/gallery', label: 'Galerie', Icon: GalleryIcon },
  { path: '/projects', label: 'Projekty', Icon: FolderIcon },
  { path: '/loras', label: 'LoRA', Icon: LoraIcon },
  { path: '/settings', label: 'Nastavení', Icon: SettingsIcon },
];

function App() {
  return (
    <ThemeProvider>
      <div data-el-name="AppLayout" className="mobile-app h-full flex flex-col">
        <main data-el-name="MainContent" className="flex-1 overflow-y-auto mobile-main-reserve">
          <Routes>
            <Route path="/" element={<GeneratePage />} />
            <Route path="/gallery" element={<GalleryPage />} />
            <Route path="/projects" element={<ProjectsPage allowCanvasOpen={false} />} />
            <Route path="/loras" element={<LorasPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
        <nav data-el-name="MobileBottomNav" className="mobile-tabbar fixed bottom-0 inset-x-0 z-30 bg-surface-glass backdrop-blur-lg border-t border-border">
          <div data-el-name="MobileNavItems" className="flex">
            {NAV_ITEMS.map(({ path, label, Icon }) => (
              <NavLink data-el-name={`MobileNavLink_${label}`}
                key={path}
                to={path}
                end={path === '/'}
                className="flex-1 min-w-[44px] min-h-[64px] flex flex-col items-center justify-center gap-1 pt-2"
              >
                {({ isActive }) => (
                  <>
                    <span
                      data-el-name="MobileNavIcon"
                      className={`flex items-center justify-center rounded-full px-5 py-1 transition-colors ${
                        isActive ? 'bg-surface-el text-txt-primary' : 'text-txt-tertiary'
                      }`}
                    >
                      <Icon size={22} />
                    </span>
                    <span
                      data-el-name={`MobileNavLabel_${label}`}
                      className={`text-[11px] leading-none ${
                        isActive ? 'text-txt-primary font-medium' : 'text-txt-tertiary'
                      }`}
                    >
                      {label}
                    </span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </ThemeProvider>
  );
}

export default App;
