import { Router } from 'express';
import {
  createThinkingWorkspace,
  deleteThinkingWorkspace,
  getAllThinkingWorkspaces,
  getThinkingWorkspaceById,
  updateThinkingWorkspace,
} from '../services/thinkingWorkspaces.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const workspaces = await getAllThinkingWorkspaces({
      status: req.query.status as any,
      projectId: req.query.projectId as string | undefined,
      tag: req.query.tag as string | undefined,
      query: req.query.query as string | undefined,
    });
    res.json(workspaces);
  } catch (error: any) {
    console.error('Error getting thinking workspaces:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const workspace = await getThinkingWorkspaceById(req.params.id);
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });
    res.json(workspace);
  } catch (error: any) {
    console.error('Error getting thinking workspace:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    if (!req.body?.title) return res.status(400).json({ error: 'title is required' });
    // Never allow the client to dictate the workspace ID.
    delete req.body.id;
    const workspace = await createThinkingWorkspace(req.body);
    res.status(201).json(workspace);
  } catch (error: any) {
    console.error('Error creating thinking workspace:', error);
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const workspace = await updateThinkingWorkspace(req.params.id, req.body);
    if (!workspace) return res.status(404).json({ error: 'Workspace not found' });
    res.json(workspace);
  } catch (error: any) {
    console.error('Error updating thinking workspace:', error);
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const ok = await deleteThinkingWorkspace(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Workspace not found' });
    res.status(204).send();
  } catch (error: any) {
    console.error('Error deleting thinking workspace:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
