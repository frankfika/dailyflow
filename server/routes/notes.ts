import { Router } from 'express';
import {
  getAllNotes,
  getNoteById,
  getNotesForDate,
  createNote,
  updateNote,
  deleteNote,
  getMentionsList,
} from '../services/notes.js';

const router = Router();

/**
 * GET /api/notes - 获取所有笔记（支持筛选）
 */
router.get('/', async (req, res) => {
  try {
    const filters: any = {};
    if (req.query.type) filters.type = req.query.type;
    if (req.query.context) filters.context = req.query.context;
    if (req.query.startDate) filters.startDate = req.query.startDate;
    if (req.query.endDate) filters.endDate = req.query.endDate;
    if (req.query.mention) filters.mention = req.query.mention;
    if (req.query.tag) filters.tag = req.query.tag;
    if (req.query.project) filters.project = req.query.project;

    const notes = await getAllNotes(filters);
    res.json(notes);
  } catch (error: any) {
    console.error('Error getting notes:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/notes/mentions - 获取所有 @mentions
 */
router.get('/mentions', async (req, res) => {
  try {
    const mentions = await getMentionsList();
    res.json(mentions);
  } catch (error: any) {
    console.error('Error getting mentions:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/notes/date/:date - 获取某天的笔记
 */
router.get('/date/:date', async (req, res) => {
  try {
    const notes = await getNotesForDate(req.params.date);
    res.json(notes);
  } catch (error: any) {
    console.error('Error getting notes for date:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/notes/:id - 获取单个笔记
 */
router.get('/:id', async (req, res) => {
  try {
    const note = await getNoteById(req.params.id);
    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }
    res.json(note);
  } catch (error: any) {
    console.error('Error getting note:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/notes - 创建笔记
 */
router.post('/', async (req, res) => {
  try {
    const note = await createNote(req.body);
    res.status(201).json(note);
  } catch (error: any) {
    console.error('Error creating note:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/notes/:id - 更新笔记
 */
router.put('/:id', async (req, res) => {
  try {
    const note = await updateNote(req.params.id, req.body);
    if (!note) {
      return res.status(404).json({ error: 'Note not found' });
    }
    res.json(note);
  } catch (error: any) {
    console.error('Error updating note:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/notes/:id - 删除笔记
 */
router.delete('/:id', async (req, res) => {
  try {
    const success = await deleteNote(req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'Note not found' });
    }
    res.status(204).send();
  } catch (error: any) {
    console.error('Error deleting note:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
