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
  res.render('register'); // Admin
});

// lists of family 
app.get('/lists_family', (req, res) => {
  res.render('lists_family'); // Admin
});

// lists of Payments 
app.get('/payments', (req, res) => {
  res.render('payments'); // Admin
});

// lists of Family Paid
app.get('/paid', (req, res) => {
  res.render('paid'); // Admin
});

// lists of Family Unpaid
app.get('/unpaid', (req, res) => {
  res.render('unpaid'); // Admin
});

// Grant Access
app.get('/grant_access', (req, res) => {
  res.render('grant_access'); // Admin
});

// Revoke Access
app.get('/revoke_access', (req, res) => {
  res.render('revoke_access'); // Admin
});

// Register Users
app.get('/user', (req, res) => {
  res.render('user'); // Admin
});

// Lists of users
app.get('/lists_user', (req, res) => {
  res.render('lists_user'); // Admin
});

// reports for admin
app.get('/report', (req, res) => {
  res.render('report'); // Admin
});

module.exports = app;
