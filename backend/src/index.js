// Load env vars from a local .env file if present.
// Safe to require even if dotenv isn't installed yet.
try {
  require('dotenv').config();
} catch (_) {
  // dotenv not installed yet; rely on real env vars
}

const express = require('express');
const healthRoutes = require('./routes/healthRoutes.js');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use('/', healthRoutes);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});