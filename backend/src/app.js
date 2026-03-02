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

// header.ejs
app.get('/header', (req, res) => {
  res.render('header'); // Admin
});


// Head of family Dashboard
app.get('/family_admin', (req, res) => {
  res.render('family_admin'); // Admin
});

// Register family member
app.get('/register_family', (req, res) => {
  res.render('register_family'); // HOF
});

// lists of family member
app.get('/family_lists', (req, res) => {
  res.render('family_lists'); // HOF
});

// family tree
app.get('/family_tree', (req, res) => {
  res.render('family_tree'); // HOF
});

// shedule
app.get('/schedule', (req, res) => {
  res.render('schedule'); // HOF
});

// Meeting List
app.get('/meeting_list', (req, res) => {
  res.render('meeting_list'); // HOF
});

// attend meeting
app.get('/attend_meeting', (req, res) => {
  res.render('attend_meeting'); // HOF
});

// reminder
app.get('/reminder', (req, res) => {
  res.render('reminder'); // HOF
});

// package
app.get('/package', (req, res) => {
  res.render('package'); // HOF
});

// payment history
app.get('/payment_history', (req, res) => {
  res.render('payment_history'); // HOF
});

// family report
app.get('/family_report', (req, res) => {
  res.render('family_report'); // HOF
});

// future head of family

// head_of_family
app.get('/head_of_family', (req, res) => {
  res.render('head_of_family'); // HOF
});

// head_of_family
app.get('/view', (req, res) => {
  res.render('view'); // HOF
});

// member

// member
app.get('/member', (req, res) => {
  res.render('member'); // HOF
});

// Dependent

// dependent
app.get('/dependent', (req, res) => {
  res.render('dependent'); // HOF
});
module.exports = app;
