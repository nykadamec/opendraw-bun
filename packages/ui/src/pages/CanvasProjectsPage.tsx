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
  onDelete: (id: string, name: string) => void;
  onRename: (id: string, currentName: string) => void;
}) {
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(project.id, project.name);
  };

  const handleDoubleClick = () => {
    onRename(project.id, project.name);
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
        onDoubleClick={handleDoubleClick}
        className="text-sm font-medium text-txt-primary truncate"
        title={project.name}
      >
        {project.name}
      </h3>
      <p className="text-xs text-txt-secondary">
        {project.imageCount} obrázků · {formatDate(project.createdAt)}
      </p>

      {/* Delete button on hover */}
      <button
        onClick={handleDelete}
        className="absolute top-3 right-3 w-7 h-7 rounded-lg flex items-center justify-center
          text-txt-tertiary hover:text-red-400 hover:bg-red-400/10
          opacity-0 group-hover:opacity-100 transition-all"
        title="Smazat"
      >
        ✕
      </button>
    </div>
  );
}

export default function CanvasProjectsPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<CanvasProjectInfo[]>([]);
  const [loading, setLoading] = useState(true);

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
    const name = window.prompt('Název nového canvasu:', 'Nový canvas');
    if (!name?.trim()) return;
    try {
      const project = await createCanvasProject(name.trim());
      navigate(`/canvas/${project.id}`);
    } catch (err) {
      console.error('Failed to create canvas project:', err);
    }
  };

  const handleNavigate = (id: string) => {
    navigate(`/canvas/${id}`);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Smazat canvas "${name}"?`)) return;
    try {
      await deleteCanvasProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      console.error('Failed to delete canvas project:', err);
    }
  };

  const handleRename = async (id: string, currentName: string) => {
    const newName = window.prompt('Přejmenovat canvas:', currentName);
    if (!newName?.trim() || newName.trim() === currentName) return;
    try {
      await renameCanvasProject(id, newName.trim());
      setProjects((prev) =>
        prev.map((p) => (p.id === id ? { ...p, name: newName.trim() } : p)),
      );
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
          onClick={handleCreate}
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
            onClick={handleCreate}
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
              onDelete={handleDelete}
              onRename={handleRename}
            />
          ))}
        </div>
      )}
    </div>
  );
}
