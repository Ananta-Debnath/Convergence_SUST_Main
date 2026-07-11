try {
  require('dotenv').config();
} catch (_) {
  // Hosting platforms can provide environment variables directly.
}

const express = require('express');
const apiRoutes = require('./routes/apiRoutes');

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Only the scoped officer API is mounted. In particular, the legacy route
// that returns unmasked agent records is intentionally not exposed.
app.use('/api', apiRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found.' });
});

app.use((error, req, res, next) => {
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body is too large.' });
  }

  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return res.status(400).json({ error: 'Request body contains invalid JSON.' });
  }

  console.error(error);
  return res.status(500).json({ error: 'Internal server error.' });
});

function startServer(port = process.env.PORT || 3000) {
  return app.listen(port, '0.0.0.0', () => {
    console.log(`Officer API listening on http://localhost:${port}`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
