import { Router } from 'express';
import {
  testPinataConnection,
  backupToPinata,
  listBackupRecords,
} from '../services/ipfs.js';

const router = Router();

router.post('/test', async (req, res) => {
  try {
    const apiKey = (req.body?.apiKey as string | undefined)?.trim();
    if (!apiKey) {
      return res.status(400).json({ ok: false, message: 'API key is required' });
    }
    const result = await testPinataConnection(apiKey);
    res.json(result);
  } catch (error: any) {
    console.error('Error testing IPFS connection:', error);
    res.status(500).json({ ok: false, message: error.message });
  }
});

router.post('/backup', async (req, res) => {
  try {
    const result = await backupToPinata();
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (error: any) {
    console.error('Error running IPFS backup:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/backups', async (_req, res) => {
  try {
    const records = await listBackupRecords();
    res.json({ records });
  } catch (error: any) {
    console.error('Error listing IPFS backups:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
