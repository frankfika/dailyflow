import { motion } from 'motion/react';
import { Plus, FolderOpen, Calendar, Tag, Trash2, Edit2, Check, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import { projectsApi, type ProjectData } from '../api/client';

interface ProjectsProps {
  language: 'en' | 'zh';
}

export function Projects({ language }: ProjectsProps) {
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectData | null>(null);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    setIsLoading(true);
    try {
      const data = await projectsApi.getAll();
      setProjects(data);
    } catch (e) {
      console.error('Failed to load projects', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateProject = async (projectData: Omit<ProjectData, 'id' | 'createdAt' | 'updatedAt' | 'filePath'>) => {
    try {
      await projectsApi.create(projectData);
      await loadProjects();
      setShowCreateModal(false);
    } catch (e) {
      console.error('Failed to create project', e);
    }
  };

  const handleUpdateProject = async (id: string, updates: Partial<Omit<ProjectData, 'id' | 'createdAt' | 'filePath'>>) => {
    try {
      await projectsApi.update(id, updates);
      await loadProjects();
      setEditingProject(null);
    } catch (e) {
      console.error('Failed to update project', e);
    }
  };

  const handleDeleteProject = async (id: string) => {
    if (!confirm(language === 'zh' ? '确定要删除这个项目吗？' : 'Are you sure you want to delete this project?')) {
      return;
    }
    try {
      await projectsApi.delete(id);
      await loadProjects();
    } catch (e) {
      console.error('Failed to delete project', e);
    }
  };

  const t = {
    title: language === 'zh' ? '项目' : 'Projects',
    createBtn: language === 'zh' ? '新建项目' : 'New Project',
    noProjects: language === 'zh' ? '暂无项目' : 'No projects yet',
    active: language === 'zh' ? '进行中' : 'Active',
    completed: language === 'zh' ? '已完成' : 'Completed',
    archived: language === 'zh' ? '已归档' : 'Archived',
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">{language === 'zh' ? '加载中...' : 'Loading...'}</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-border">
        <h1 className="text-2xl font-bold">{t.title}</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent text-white hover:bg-accent/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          {t.createBtn}
        </button>
      </div>

      {/* Projects Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <FolderOpen className="w-16 h-16 mb-4 opacity-50" />
            <p>{t.noProjects}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map(project => (
              <ProjectCard
                key={project.id}
                project={project}
                language={language}
                onEdit={setEditingProject}
                onDelete={handleDeleteProject}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {(showCreateModal || editingProject) && (
        <ProjectModal
          project={editingProject}
          language={language}
          onClose={() => {
            setShowCreateModal(false);
            setEditingProject(null);
          }}
          onSave={editingProject
            ? (updates) => handleUpdateProject(editingProject.id, updates)
            : handleCreateProject
          }
        />
      )}
    </div>
  );
}

// ProjectCard 组件
interface ProjectCardProps {
  project: ProjectData;
  language: 'en' | 'zh';
  onEdit: (project: ProjectData) => void;
  onDelete: (id: string) => void;
}

function ProjectCard({ project, language, onEdit, onDelete }: ProjectCardProps) {
  const statusColors = {
    active: 'bg-blue-500/10 text-blue-600',
    completed: 'bg-green-500/10 text-green-600',
    archived: 'bg-gray-500/10 text-gray-600',
  };

  const statusLabels = {
    active: language === 'zh' ? '进行中' : 'Active',
    completed: language === 'zh' ? '已完成' : 'Completed',
    archived: language === 'zh' ? '已归档' : 'Archived',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-background border border-border rounded-xl p-4 hover:border-accent/50 transition-colors"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-lg font-semibold flex-1">{project.name}</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onEdit(project)}
            className="p-1.5 rounded-lg hover:bg-accent/10 text-accent transition-colors"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => onDelete(project.id)}
            className="p-1.5 rounded-lg hover:bg-red-500/10 text-red-600 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Status */}
      <div className="mb-3">
        <span className={`inline-flex items-center px-2 py-1 rounded-lg text-xs font-medium ${statusColors[project.status]}`}>
          {statusLabels[project.status]}
        </span>
      </div>

      {/* Description */}
      {project.description && (
        <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
          {project.description}
        </p>
      )}

      {/* Meta */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        {project.deadline && (
          <div className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {new Date(project.deadline).toLocaleDateString()}
          </div>
        )}
        {project.tags && project.tags.length > 0 && (
          <div className="flex items-center gap-1">
            <Tag className="w-3 h-3" />
            {project.tags.length}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ProjectModal 组件
interface ProjectModalProps {
  project: ProjectData | null;
  language: 'en' | 'zh';
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
}

function ProjectModal({ project, language, onClose, onSave }: ProjectModalProps) {
  const [name, setName] = useState(project?.name || '');
  const [description, setDescription] = useState(project?.description || '');
  const [status, setStatus] = useState<'active' | 'completed' | 'archived'>(project?.status || 'active');
  const [deadline, setDeadline] = useState(project?.deadline || '');
  const [tags, setTags] = useState(project?.tags?.join(', ') || '');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;

    setIsSaving(true);
    try {
      await onSave({
        name: name.trim(),
        description: description.trim() || undefined,
        status,
        deadline: deadline || undefined,
        tags: tags.trim() ? tags.split(',').map(t => t.trim()) : undefined,
      });
    } catch (e) {
      console.error('Failed to save project', e);
    } finally {
      setIsSaving(false);
    }
  };

  const t = {
    title: project ? (language === 'zh' ? '编辑项目' : 'Edit Project') : (language === 'zh' ? '新建项目' : 'New Project'),
    nameLabel: language === 'zh' ? '项目名称' : 'Project Name',
    namePlaceholder: language === 'zh' ? '输入项目名称' : 'Enter project name',
    descLabel: language === 'zh' ? '项目描述' : 'Description',
    descPlaceholder: language === 'zh' ? '输入项目描述（可选）' : 'Enter description (optional)',
    statusLabel: language === 'zh' ? '状态' : 'Status',
    deadlineLabel: language === 'zh' ? '截止日期' : 'Deadline',
    tagsLabel: language === 'zh' ? '标签' : 'Tags',
    tagsPlaceholder: language === 'zh' ? '用逗号分隔，如：前端, React' : 'Comma separated, e.g., frontend, React',
    saveBtn: language === 'zh' ? '保存' : 'Save',
    cancelBtn: language === 'zh' ? '取消' : 'Cancel',
    active: language === 'zh' ? '进行中' : 'Active',
    completed: language === 'zh' ? '已完成' : 'Completed',
    archived: language === 'zh' ? '已归档' : 'Archived',
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-background rounded-2xl border border-border w-full max-w-lg p-6"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold mb-6">{t.title}</h2>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium mb-2">{t.nameLabel}</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t.namePlaceholder}
              className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-accent transition-colors"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium mb-2">{t.descLabel}</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder={t.descPlaceholder}
              rows={3}
              className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-accent transition-colors resize-none"
            />
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-medium mb-2">{t.statusLabel}</label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value as 'active' | 'completed' | 'archived')}
              className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-accent transition-colors"
            >
              <option value="active">{t.active}</option>
              <option value="completed">{t.completed}</option>
              <option value="archived">{t.archived}</option>
            </select>
          </div>

          {/* Deadline */}
          <div>
            <label className="block text-sm font-medium mb-2">{t.deadlineLabel}</label>
            <input
              type="date"
              value={deadline}
              onChange={e => setDeadline(e.target.value)}
              className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-accent transition-colors"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium mb-2">{t.tagsLabel}</label>
            <input
              type="text"
              value={tags}
              onChange={e => setTags(e.target.value)}
              placeholder={t.tagsPlaceholder}
              className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm outline-none focus:border-accent transition-colors"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-6">
          <button
            onClick={handleSave}
            disabled={isSaving || !name.trim()}
            className="flex-1 py-3 rounded-xl bg-accent text-white font-medium hover:bg-accent/90 transition-colors disabled:opacity-50"
          >
            {isSaving ? (language === 'zh' ? '保存中...' : 'Saving...') : t.saveBtn}
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl bg-accent/10 text-accent font-medium hover:bg-accent/20 transition-colors"
          >
            {t.cancelBtn}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
