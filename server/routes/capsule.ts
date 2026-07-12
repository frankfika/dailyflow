import { Router } from 'express';
import {
  listCapsules,
  getCapsule,
  createCapsule,
  revealCapsule,
  deleteCapsule,
  getDueCapsules,
  sealToArweave,
  sealToEvm,
} from '../services/capsule.js';
import type { CapsuleInput, CapsuleRevealInput } from '../types/capsule.js';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const capsules = await listCapsules();
    res.json({ capsules });
  } catch (error: any) {
    console.error('Error listing capsules:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/due', async (_req, res) => {
  try {
    const capsules = await getDueCapsules();
    res.json({ capsules });
  } catch (error: any) {
    console.error('Error listing due capsules:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const capsule = await getCapsule(req.params.id);
    if (!capsule) {
      return res.status(404).json({ error: 'Capsule not found' });
    }
    res.json(capsule);
  } catch (error: any) {
    console.error('Error fetching capsule:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const input = req.body as CapsuleInput;
    if (!input?.title || !input?.content || !input?.unlockAt) {
      return res.status(400).json({ error: 'title, content, and unlockAt are required' });
    }
    const capsule = await createCapsule(input);
    res.status(201).json(capsule);
  } catch (error: any) {
    console.error('Error creating capsule:', error);
    res.status(500).json({ error: error.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const input = req.body as CapsuleRevealInput;
    const capsule = await revealCapsule(req.params.id, input);
    if (!capsule) {
      return res.status(404).json({ error: 'Capsule not found' });
    }
    res.json(capsule);
  } catch (error: any) {
    console.error('Error revealing capsule:', error);
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const ok = await deleteCapsule(req.params.id);
    if (!ok) {
      return res.status(404).json({ error: 'Capsule not found' });
    }
    res.status(204).send();
  } catch (error: any) {
    console.error('Error deleting capsule:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/seal/arweave', async (req, res) => {
  try {
    const capsule = await getCapsule(req.params.id);
    if (!capsule) {
      return res.status(404).json({ error: 'Capsule not found' });
    }
    const updated = await sealToArweave(capsule);
    res.json(updated);
  } catch (error: any) {
    console.error('Error sealing capsule to Arweave:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/seal/evm', async (req, res) => {
  try {
    const capsule = await getCapsule(req.params.id);
    if (!capsule) {
      return res.status(404).json({ error: 'Capsule not found' });
    }
    const proof = req.body as {
      txId?: string;
      chainId?: number;
      contractAddress?: string;
      onChainId?: number;
      contentHash?: string;
    };
    const updated = await sealToEvm(capsule, proof);
    res.json(updated);
  } catch (error: any) {
    console.error('Error sealing capsule to EVM:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
