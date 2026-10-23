import { Router } from 'express';
import { getMissionPreview, getMissionPreviewImage, renderMissionPreview } from './services/mission-preview.js';

export function missionPreviewRoutes(indexHtml: string) {
  const router = Router();
  router.get('/api/mission-previews/:address/image.jpg', async (req, res) => {
    const mission = await getMissionPreview(req.params.address);
    const image = mission ? await getMissionPreviewImage(mission) : null;
    if (!image) { res.status(404).end(); return; }
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.type('image/jpeg').send(image);
  });
  router.get('/missoes/:address', async (req, res, next) => {
    const mission = await getMissionPreview(req.params.address);
    if (!mission) { next(); return; }
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.type('html').send(renderMissionPreview(indexHtml, mission));
  });
  return router;
}
