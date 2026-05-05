import { Router } from 'express';
import {
  getAllProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
} from '../services/projects.js';

const router = Router();

/**
 * GET /api/projects - 获取所有项目
 */
router.get('/', async (req, res) => {
  try {
    const projects = await getAllProjects();
    res.json(projects);
  } catch (error: any) {
    console.error('Error getting projects:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/projects/:id - 获取单个项目
 */
router.get('/:id', async (req, res) => {
  try {
    const project = await getProjectById(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json(project);
  } catch (error: any) {
    console.error('Error getting project:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/projects - 创建新项目
 */
router.post('/', async (req, res) => {
  try {
    const project = await createProject(req.body);
    res.status(201).json(project);
  } catch (error: any) {
    console.error('Error creating project:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/projects/:id - 更新项目
 */
router.put('/:id', async (req, res) => {
  try {
    const project = await updateProject(req.params.id, req.body);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json(project);
  } catch (error: any) {
    console.error('Error updating project:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/projects/:id - 删除项目
 */
router.delete('/:id', async (req, res) => {
  try {
    const success = await deleteProject(req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.status(204).send();
  } catch (error: any) {
    console.error('Error deleting project:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
