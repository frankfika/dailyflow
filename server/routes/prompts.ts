import { Router } from 'express';
import {
  getAllPrompts,
  getPromptById,
  createPrompt,
  updatePrompt,
  deletePrompt,
} from '../services/prompts.js';

const router = Router();

/**
 * GET /api/prompts - 获取所有提示词模板
 */
router.get('/', async (req, res) => {
  try {
    const prompts = await getAllPrompts();
    res.json(prompts);
  } catch (error: any) {
    console.error('Error getting prompts:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/prompts/:id - 获取单个提示词
 */
router.get('/:id', async (req, res) => {
  try {
    const prompt = await getPromptById(req.params.id);
    if (!prompt) {
      return res.status(404).json({ error: 'Prompt not found' });
    }
    res.json(prompt);
  } catch (error: any) {
    console.error('Error getting prompt:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/prompts - 创建提示词模板
 */
router.post('/', async (req, res) => {
  try {
    const prompt = await createPrompt(req.body);
    res.status(201).json(prompt);
  } catch (error: any) {
    console.error('Error creating prompt:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/prompts/:id - 更新提示词
 */
router.put('/:id', async (req, res) => {
  try {
    const prompt = await updatePrompt(req.params.id, req.body);
    if (!prompt) {
      return res.status(404).json({ error: 'Prompt not found' });
    }
    res.json(prompt);
  } catch (error: any) {
    console.error('Error updating prompt:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/prompts/:id - 删除提示词
 */
router.delete('/:id', async (req, res) => {
  try {
    const success = await deletePrompt(req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'Prompt not found' });
    }
    res.status(204).send();
  } catch (error: any) {
    console.error('Error deleting prompt:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
