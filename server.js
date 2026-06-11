'use strict';

const express = require('express');
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// Limite globale des requêtes : 200 req / 15 min par IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Servir Paper.js depuis node_modules (évite une dépendance CDN externe)
app.use(
  '/vendor/paper-full.min.js',
  express.static(
    path.join(__dirname, 'node_modules', 'paper', 'dist', 'paper-full.min.js')
  )
);

// Servir les fichiers statiques du dossier public/
app.use(express.static(path.join(__dirname, 'public')));

// Route principale
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Serveur Textile PoC démarré sur http://localhost:${PORT}`);
});
