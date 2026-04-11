import { Router } from 'express';

const router = Router();

// Claude Code bridge (Phase 3 stub)
router.post('/', (req, res) => {
  const { message } = req.body;

  res.json({
    role: 'assistant',
    content:
      'Claude Code integration will be connected in Phase 3. This panel will let you ask questions about your data and build custom widgets.',
    timestamp: new Date().toISOString(),
  });
});

export default router;
