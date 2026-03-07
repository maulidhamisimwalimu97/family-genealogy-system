// --- 1. IMPORTS ---
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');
const db = require('./config/db');

const app = express();

// --- HELPER: Format Tanzanian Phone Numbers ---
function formatPhone(phone) {
  let p = phone.trim();
  if (p.startsWith('+')) p = p.slice(1);
  if (p.startsWith('0')) p = '255' + p.slice(1);
  // Ensure it starts with 255
  if (!p.startsWith('255')) p = '255' + p;
  return p;
}

// --- 2. SETTINGS & VIEW ENGINE ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../../frontend/views'));

// --- 3. MIDDLEWARE ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../../frontend')));

// Session Configuration
app.use(session({
    secret: 'secret-key-genealogy', 
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, 
        maxAge: 24 * 60 * 60 * 1000 
    }
}));

// Global Cache Control (Prevents back-button access after logout)
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-cache, private, no-store, must-revalidate, max-stale=0, post-check=0, pre-check=0');
    next();
});

// --- 4. AUTHENTICATION ROUTES ---

app.use((req, res, next) => {

    const adminId = req.session.adminId;
    const adminName = req.session.adminName;

    res.locals.adminName = adminName || null;
    res.locals.familyCount = 0;

    if (!adminId) return next();

    const sql = "SELECT COUNT(*) AS totalFamilies FROM family WHERE registered_by = ?";

    db.query(sql, [adminId], (err, result) => {

        if (!err && result.length > 0) {
            res.locals.familyCount = result[0].totalFamilies;
        }

        next();
    });

});
// Login page
app.get('/index', (req, res) => {
    res.render('index', { error: null });
});

// Login process
app.post('/index', (req, res) => {
    const { phone, password } = req.body;
    const sql = "SELECT * FROM system_admin WHERE phone = ? LIMIT 1";

    db.query(sql, [phone], async (err, result) => {
        if (err) {
            console.log(err);
            return res.render('index', { error: "Server error" });
        }

        if (result.length === 0) {
            return res.render('index', { error: "Phone number not found" });
        }

        const user = result[0];
        const match = await bcrypt.compare(password, user.password);

        if (!match) {
            return res.render('index', { error: "Incorrect password" });
        }

        // Login success
        req.session.adminId = user.admin_id;
        req.session.adminName = user.full_name;
        res.redirect('/Admin');
    });
});

// Logout process
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.log("Logout Error:", err);
            return res.redirect('/Admin');
        }
        res.clearCookie('connect.sid'); 
        res.redirect('/index'); 
    });
});

// --- 5. ADMIN DASHBOARD ROUTES ---

// Root redirect
app.get('/', (req, res) => {
  res.redirect('/Admin');
});

// Admin Dashboard - Protected
app.get('/Admin', (req, res) => {
    if (!req.session || !req.session.adminId) {
        return res.redirect('/index');
    }

    const adminId = req.session.adminId;
    const adminName = req.session.adminName;

    // 1. Query to count total families for this admin
    // 2. Query to get the latest 5 families for the table
    const countSql = "SELECT COUNT(*) AS totalFamilies FROM family WHERE registered_by = ?";
    const listSql = "SELECT * FROM family WHERE registered_by = ? ORDER BY created_at DESC LIMIT 5";

    db.query(countSql, [adminId], (err, countResult) => {
        if (err) {
            console.error(err);
            return res.render('Admin', { adminName, familyCount: 0, families: [] });
        }

        db.query(listSql, [adminId], (err, familyList) => {
            const familyCount = countResult[0].totalFamilies || 0;

            res.render('Admin', { 
                adminName: adminName, 
                familyCount: familyCount,
                families: familyList // This is the array of family data
            });
        });
    });
});

// registrations 
// --- GET: Render Registration Form ---
app.get('/register', (req, res) => {

    if (!req.session.adminId) return res.redirect('/index');

    res.render('register', {
        error: null,
        success: null
    });

});
  // --- POST: Handle Family Registration ---
  app.post('/register-family', async (req, res) => {
      const adminId = req.session.adminId;
      const adminName = req.session.adminName;

      if (!adminId) return res.redirect('/index');

      const { 
          family_name, tribe, region, religion, address, 
          first_name, last_name, phone, email, gender 
      } = req.body;

      // Helper: Attaches familyCount to the current response context
      const getCountAndRender = (errorMsg, successMsg) => {
          const countSql = "SELECT COUNT(*) AS totalFamilies FROM family WHERE registered_by = ?";
          db.query(countSql, [adminId], (err, countResult) => {
              const familyCount = (!err && countResult.length > 0) ? countResult[0].totalFamilies : 0;
              
              res.render('register', { 
                  adminName,
                  familyCount, // Passed directly just to be safe
                  error: errorMsg, 
                  success: successMsg 
              });
          });
      };

      // 1. Validation
      if (!family_name || !tribe || !region || !first_name || !last_name || !phone) {
          return getCountAndRender('Tafadhali jaza sehemu zote zenye nyota (*)', null);
      }

      const formattedPhone = formatPhone(phone);

      try {
          // 2. Check if phone exists
          db.query("SELECT member_id FROM family_member WHERE phone = ? LIMIT 1", [formattedPhone], async (err, result) => {
              if (err) return getCountAndRender('Database error checking phone', null);
              if (result && result.length > 0) return getCountAndRender('Namba hii tayari imesajiliwa.', null);

              const plainPassword = crypto.randomBytes(3).toString('hex'); 
              const hashedPassword = await bcrypt.hash(plainPassword, 10);

              // 3. Insert Family
              const familySql = `INSERT INTO family (family_name, tribe, region, religion, address, phone, registered_by, permissions) VALUES (?, ?, ?, ?, ?, ?, ?, '')`;
              db.query(familySql, [family_name, tribe, region, religion || null, address || null, formattedPhone, adminId], (err2, familyResult) => {
                  if (err2) return getCountAndRender('Error saving family data.', null);

                  const familyId = familyResult.insertId;

                  // 4. Insert Member
                  const memberSql = `INSERT INTO family_member (family_id, first_name, last_name, gender, phone, email, role, password) VALUES (?, ?, ?, ?, ?, ?, 'family_admin', ?)`;
                  db.query(memberSql, [familyId, first_name, last_name, gender, formattedPhone, email || null, hashedPassword], async (err3) => {
                      if (err3) return getCountAndRender('Error saving admin member.', null);

                      // 5. SMS (Async - won't wait for response to render)
                      const auth = Buffer.from('7296068691500366:NmZjN2I0Njg5YTA5YWEyY2E2YmY1ZTZlOTY3ZTM0ZDA4ODgyNjkyYjk2OTdmNjlkMTY1OWZjZTE0MjAwZjRkMg==').toString('base64');
                      axios.post('https://apisms.beem.africa/v1/send', {
                          source_addr: 'AFYASTOCK', 
                          message: `Habari ${first_name}, Familia ya ${family_name} imesajiliwa! Pass: ${plainPassword}`,
                          recipients: [{ recipient_id: 1, dest_addr: formattedPhone }]
                      }, { headers: { 'Authorization': `Basic ${auth}` } }).catch(e => console.log("SMS failed"));

                      // 6. Final Success
                      getCountAndRender(null, `Familia ya ${family_name} imesajiliwa kikamilifu!`);
                  });
              });
          });
      } catch (error) {
          getCountAndRender('Something went wrong during processing.', null);
      }
  });
  // --- GET: List All Families ---
  // --- GET: List All Families with Live Notification Count ---
  app.get('/lists_family', (req, res) => {
    const adminId = req.session.adminId;
    const adminName = req.session.adminName;

    if (!adminId) return res.redirect('/index');

    // 1. First, get the count for the notification bell
    const countSql = "SELECT COUNT(*) AS totalFamilies FROM family WHERE registered_by = ?";
    
    db.query(countSql, [adminId], (err, countResult) => {
      if (err) {
        console.error("Count Error:", err);
        return res.render('lists_family', { adminName, familyCount: 0, families: [], error: 'Database error' });
      }

      const familyCount = countResult[0].totalFamilies || 0;

      // 2. Then, get the full list of families for the table
      const listSql = `
        SELECT f.*, fm.first_name, fm.last_name, fm.email 
        FROM family f 
        LEFT JOIN family_member fm ON f.family_id = fm.family_id AND fm.role = 'family_admin'
        WHERE f.registered_by = ?
        ORDER BY f.created_at DESC`;

      db.query(listSql, [adminId], (err2, families) => {
        if (err2) {
          console.error("List Error:", err2);
          return res.render('lists_family', { 
            adminName, 
            familyCount, 
            families: [], 
            error: 'Failed to load families' 
          });
        }

        // 3. Render the page with both the count and the list
        res.render('lists_family', { 
            adminName, 
            familyCount, // This fixes the notification badge
            families, 
            success: req.query.success || null, 
            error: req.query.error || null 
        });
      });
    });
  });
// --- Update Family ---
app.post('/update-family', (req, res) => {
    const { family_id, family_name, tribe, region, religion } = req.body;
    const sql = "UPDATE family SET family_name=?, tribe=?, region=?, religion=? WHERE family_id=?";
    db.query(sql, [family_name, tribe, region, religion, family_id], (err) => {
        if (err) return res.redirect('/lists_family?error=Update failed');
        res.redirect('/lists_family?success=Family updated successfully');
    });
});

// --- Delete Family ---
app.post('/delete-family', (req, res) => {
    const { family_id } = req.body;
    // Note: You should have ON DELETE CASCADE in your DB or delete members first
    db.query("DELETE FROM family WHERE family_id = ?", [family_id], (err) => {
        if (err) return res.redirect('/lists_family?error=Delete failed');
        res.redirect('/lists_family?success=Family deleted successfully');
    });
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

// select future head of family
app.get('/select_future', (req, res) => {
  res.render('select_future'); // HOF
});

// chat list
app.get('/chat_list', (req, res) => {
  res.render('chat_list'); // HOF
});

// chat room
app.get('/chat_room', (req, res) => {
  res.render('chat_room'); // HOF
});

// family chat
app.get('/family_chat', (req, res) => {
  res.render('family_chat'); // HOF
});

// direct chat
app.get('/direct_messages', (req, res) => {
  res.render('direct_messages'); // HOF
});

// drive files
app.get('/drive_files', (req, res) => {
  res.render('drive_files'); // HOF
});

// upload files
app.get('/upload_file', (req, res) => {
  res.render('upload_file'); // HOF
});


module.exports = app;
