import express from 'express';
import { docker } from '../docker/dockerManager.js';
import { authorize, requireAuth } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth, authorize('faculty', 'admin'));

function formatContainer(container) {
  const names = (container.Names || []).map((name) => name.replace(/^\//, ''));
  return {
    id: container.Id,
    shortId: container.Id.slice(0, 12),
    names,
    name: names[0] || container.Id.slice(0, 12),
    image: container.Image,
    state: container.State,
    status: container.Status,
    created: container.Created ? new Date(container.Created * 1000).toISOString() : null,
    ports: container.Ports || [],
    isLabContainer: names.some((name) => name.startsWith('lab_exam_')),
  };
}

router.get('/containers', async (req, res) => {
  try {
    const containers = await docker.listContainers({ all: true });
    res.json(containers.map(formatContainer));
  } catch (err) {
    console.error('[docker] list containers error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/containers/:id', async (req, res) => {
  try {
    const container = docker.getContainer(req.params.id);
    const inspect = await container.inspect();
    const name = String(inspect.Name || '').replace(/^\//, '');

    await container.remove({ force: req.query.force === '1' });
    res.json({ success: true, removed: name || req.params.id });
  } catch (err) {
    console.error('[docker] remove container error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/prune-lab-containers', async (req, res) => {
  try {
    const containers = await docker.listContainers({ all: true });
    const stoppedLabContainers = containers.filter((container) => {
      const names = (container.Names || []).map((name) => name.replace(/^\//, ''));
      return container.State !== 'running' && names.some((name) => name.startsWith('lab_exam_'));
    });

    const removed = [];
    for (const info of stoppedLabContainers) {
      const container = docker.getContainer(info.Id);
      await container.remove({ force: true });
      removed.push(formatContainer(info));
    }

    res.json({ success: true, removedCount: removed.length, removed });
  } catch (err) {
    console.error('[docker] prune lab containers error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
