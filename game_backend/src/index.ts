import express from 'express';
import path from 'path';
import cors from 'cors';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || '3005';

app.use(cors());

// Health check endpoint
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', service: 'game-backend' });
});

// Serve static game files from the public folder under /game route
const publicPath = path.join(__dirname, '..', 'public');
app.use('/game', express.static(publicPath));

// Fallback to index.html under /game/ route
app.get('/game/*', (_req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[Game Backend] Server listening on http://localhost:${PORT}`);
});
