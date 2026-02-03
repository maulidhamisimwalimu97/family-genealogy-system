const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../../frontend/views'));

app.use(express.static(path.join(__dirname, '../../frontend')));

/**
 * Root → redirect to Admin
 */
app.get('/', (req, res) => {
  res.redirect('/Admin');
});

/**
 * Admin Dashboard
 */
app.get('/Admin', (req, res) => {
  res.render('Admin'); // Admin.ejs
});

// registrations 
app.get('/register', (req, res) => {
  res.render('register'); // Admin.ejs
});

// lists of family 
app.get('/lists_family', (req, res) => {
  res.render('lists_family'); // Admin.ejs
});

module.exports = app;
