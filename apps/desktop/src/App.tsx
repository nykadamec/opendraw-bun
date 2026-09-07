import { Routes, Route, useLocation } from 'react-router-dom';
import {
  GeneratePage,
  GalleryPage,
  ProjectsPage,
  LorasPage,
  CanvasProjectsPage,
  SettingsPage,
  DesktopSidebar,
  useFeatureFlag,
} from '@opendraw/ui';
import { ThemeProvider } from '@opendraw/config-theme';

function App() {
  const location = useLocation();
  const isGeneratePage = location.pathname === '/';
  const [canvasgen2] = useFeatureFlag('canvasgen2', false);

  return (
    <ThemeProvider>
      <div data-el-name="AppLayout" className={`h-full ${canvasgen2 ? '' : 'flex flex-row'}`}>
        <DesktopSidebar />
        <main
          data-el-name="MainContent"
          className={`overflow-y-auto ${canvasgen2 ? 'h-full w-full' : 'flex-1'}`}
        >
          {!canvasgen2 && (
            <p className="sr-only">
              {isGeneratePage ? 'Stránka Generovat' : 'Obsah aplikace OpenDraw'}
            </p>
          )}
          <Routes>
            <Route path="/" element={<GeneratePage />} />
            <Route path="/gallery" element={<GalleryPage />} />
            <Route path="/canvas" element={<CanvasProjectsPage />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/loras" element={<LorasPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </main>
      </div>
    </ThemeProvider>
  );
}

export default App;
