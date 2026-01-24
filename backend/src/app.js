const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());

/**
 * Serve frontend static files
 */
app.use(express.static(path.join(__dirname, '../../frontend')));

/**
 * Default route → load index.html
 */
app.get('/', (req, res) => {
  res.sendFile(
    path.join(__dirname, '../../frontend/index.html')
  );
});

module.exports = app;
