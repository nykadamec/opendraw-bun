import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  listCanvasProjects,
  createCanvasProject,
  deleteCanvasProject,
  renameCanvasProject,
} from '@opendraw/api-client';
import type { CanvasProjectInfo } from '@opendraw/api-client';

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('cs-CZ', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function ProjectCard({
  project,
  onNavigate,
  onDelete,
  onRename,
}: {
  project: CanvasProjectInfo;
  onNavigate: (id: string) => void;
  onDelete: (project: CanvasProjectInfo) => void;
  onRename: (project: CanvasProjectInfo) => void;
}) {
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(project);
  };

  const handleRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRename(project);
  };

  return (
    <div
      onClick={() => onNavigate(project.id)}
      className="bg-surface border border-border rounded-2xl p-4 hover:bg-surface-el transition-colors cursor-pointer group relative"
    >
      {/* Thumbnail placeholder */}
      <div className="aspect-video bg-canvas rounded-lg mb-3 flex items-center justify-center text-txt-tertiary text-sm">
        {project.imageCount > 0 ? (
          <span>{project.imageCount} obrázků</span>
        ) : (
          'Prázdný canvas'
        )}
      </div>

      <h3
        onDoubleClick={(e) => { e.stopPropagation(); onRename(project); }}
        className="text-sm font-medium text-txt-primary truncate"
        title={project.name}
      >
        {project.name}
      </h3>
      <p className="text-xs text-txt-secondary">
        {project.imageCount} obrázků · {formatDate(project.createdAt)}
      </p>

      {/* Akce */}
      <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
        <button
          onClick={handleRename}
          className="w-7 h-7 rounded-lg flex items-center justify-center
            text-txt-tertiary hover:text-txt-primary hover:bg-surface-el transition-all"
          title="Přejmenovat"
          aria-label={`Přejmenovat canvas ${project.name}`}
        >
          ✎
        </button>
        <button
          onClick={handleDelete}
          className="w-7 h-7 rounded-lg flex items-center justify-center
            text-txt-tertiary hover:text-red-400 hover:bg-red-400/10 transition-all"
          title="Smazat"
          aria-label={`Smazat canvas ${project.name}`}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export default function CanvasProjectsPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<CanvasProjectInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [renameTarget, setRenameTarget] = useState<CanvasProjectInfo | null>(null);
  const [renameName, setRenameName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<CanvasProjectInfo | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      const list = await listCanvasProjects();
      setProjects(list);
    } catch (err) {
      console.error('Failed to load canvas projects:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async () => {
    const name = createName.trim();
    if (!name) return;
    try {
      const project = await createCanvasProject(name);
      setCreateOpen(false);
      setCreateName('');
      navigate(`/canvas/${project.id}`);
    } catch (err) {
      console.error('Failed to create canvas project:', err);
    }
  };

  const handleNavigate = (id: string) => {
    navigate(`/canvas/${id}`);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      await deleteCanvasProject(deleteTarget.id);
      setProjects((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      console.error('Failed to delete canvas project:', err);
    }
  };

  const handleRenameConfirm = async () => {
    if (!renameTarget) return;
    const name = renameName.trim();
    if (!name || name === renameTarget.name) {
      setRenameTarget(null);
      return;
    }
    try {
      await renameCanvasProject(renameTarget.id, name);
      setProjects((prev) =>
        prev.map((p) => (p.id === renameTarget.id ? { ...p, name } : p)),
      );
      setRenameTarget(null);
    } catch (err) {
      console.error('Failed to rename canvas project:', err);
    }
  };

  return (
    <div className="h-full w-full p-6 overflow-y-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-txt-primary">
          Canvas projekty
        </h1>
        <button
          onClick={() => { setCreateName(''); setCreateOpen(true); }}
          className="px-4 py-2 rounded-full text-sm bg-surface-el border border-border
            text-txt-primary hover:bg-border transition-colors"
        >
          + Nový canvas
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-txt-secondary text-sm">
          Načítání…
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-txt-tertiary">
          <p className="text-sm mb-2">Zatím nemáte žádné canvas projekty</p>
          <button
            onClick={() => { setCreateName(''); setCreateOpen(true); }}
            className="px-4 py-2 rounded-full text-sm bg-surface-el border border-border
              text-txt-primary hover:bg-border transition-colors"
          >
            Vytvořit první canvas
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {projects.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              onNavigate={handleNavigate}
              onDelete={setDeleteTarget}
              onRename={(proj) => { setRenameTarget(proj); setRenameName(proj.name); }}
            />
          ))}
        </div>
      )}

      {createOpen && (
        <>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" onClick={() => setCreateOpen(false)} />
          <div role="dialog" aria-modal="true" aria-label="Nový canvas"
            className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-sm bg-surface rounded-[24px] p-4 border border-border">
            <h3 className="text-[17px] font-semibold text-txt-primary mb-3">Nový canvas</h3>
            <input
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setCreateOpen(false); }}
              placeholder="Název canvasu"
              autoFocus
              className="w-full min-h-[48px] rounded-2xl bg-canvas border border-border px-3 text-[15px] text-txt-primary placeholder:text-txt-tertiary outline-none focus:border-txt-primary/50 transition-colors mb-3"
            />
            <div className="flex gap-2">
              <button onClick={() => setCreateOpen(false)}
                className="flex-1 min-h-[48px] rounded-2xl border border-border text-txt-secondary text-[15px] active:bg-border transition-colors">Zrušit</button>
              <button onClick={handleCreate} disabled={!createName.trim()}
                className="flex-1 min-h-[48px] rounded-2xl bg-txt-primary text-canvas text-[15px] font-medium active:opacity-80 transition-opacity disabled:opacity-40">Vytvořit</button>
            </div>
          </div>
        </>
      )}

      {renameTarget && (
        <>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" onClick={() => setRenameTarget(null)} />
          <div role="dialog" aria-modal="true" aria-label="Přejmenovat canvas"
            className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-sm bg-surface rounded-[24px] p-4 border border-border">
            <h3 className="text-[17px] font-semibold text-txt-primary mb-3">Přejmenovat canvas</h3>
            <input
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleRenameConfirm(); if (e.key === 'Escape') setRenameTarget(null); }}
              autoFocus
              className="w-full min-h-[48px] rounded-2xl bg-canvas border border-border px-3 text-[15px] text-txt-primary outline-none focus:border-txt-primary/50 transition-colors mb-3"
            />
            <div className="flex gap-2">
              <button onClick={() => setRenameTarget(null)}
                className="flex-1 min-h-[48px] rounded-2xl border border-border text-txt-secondary text-[15px] active:bg-border transition-colors">Zrušit</button>
              <button onClick={handleRenameConfirm} disabled={!renameName.trim()}
                className="flex-1 min-h-[48px] rounded-2xl bg-txt-primary text-canvas text-[15px] font-medium active:opacity-80 transition-opacity disabled:opacity-40">Uložit</button>
            </div>
          </div>
        </>
      )}

      {deleteTarget && (
        <>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" onClick={() => setDeleteTarget(null)} />
          <div role="dialog" aria-modal="true" aria-label="Smazat canvas"
            className="fixed z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-sm bg-surface rounded-[24px] p-4 border border-border">
            <h3 className="text-[17px] font-semibold text-txt-primary">Smazat canvas?</h3>
            <p className="text-[14px] text-txt-secondary mt-1 mb-4">„{deleteTarget.name}" se trvale odstraní.</p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteTarget(null)}
                className="flex-1 min-h-[48px] rounded-2xl border border-border text-txt-secondary text-[15px] active:bg-border transition-colors">Ponechat</button>
              <button onClick={handleDeleteConfirm}
                className="flex-1 min-h-[48px] rounded-2xl bg-red-500 text-white text-[15px] font-medium active:opacity-80 transition-opacity">Smazat</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
