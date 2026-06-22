import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { DockerAnalyzer } from '../analyzer/docker-analyzer.js';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, '../../public');

const app = express();
const PORT = parseInt(process.env.PORT ?? '3000', 10);

app.use(express.json());
app.use(express.static(publicDir));

app.get('/', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.post('/api/analyze', async (req, res) => {
  try {
    const dockerSocket = (req.query.dockerSocket as string) || process.env.DOCKER_SOCKET || '/var/run/docker.sock';
    const analyzer = new DockerAnalyzer(dockerSocket);
    const report = await analyzer.analyze();
    res.json({ success: true, data: report });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/history', (_req, res) => {
  res.json({ success: true, data: [] });
});

app.post('/api/prune', async (req, res) => {
  try {
    const { category, ids } = req.body;
    res.status(501).json({
      success: false,
      error: 'Prune execution is intentionally disabled in this prototype. Review and run the recommended Docker command manually.',
      category,
      items: ids ?? [],
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Docker Storage Analyzer web UI: http://localhost:${PORT}`);
});
