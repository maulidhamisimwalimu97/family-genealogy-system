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
    const adminId = req.session.adminId;
    if (!adminId) return res.redirect('/index');

    // SQL to get payment details + family name
    // Adjust 'family_name' or 'payer_name' columns based on your specific table schema
    const sql = `
        SELECT p.*, f.family_name 
        FROM payment p
        JOIN family f ON p.family_id = f.family_id
        ORDER BY p.payment_date DESC`;

    db.query(sql, (err, payments) => {
        if (err) {
            console.error("Payment Fetch Error:", err);
            return res.render('payments', { payments: [], error: "Could not load payments." });
        }

        res.render('payments', { 
            payments: payments,
            error: null,
            success: req.query.success || null 
        });
    });
});

// lists of Family Paid
app.get('/paid', (req, res) => {
    const adminId = req.session.adminId;
    if (!adminId) return res.redirect('/index');

    // Query to get family details, the admin of that family, and their payment info
    const sql = `
        SELECT 
            f.family_name, 
            fm.first_name, 
            fm.last_name, 
            fm.phone, 
            p.amount, 
            p.payment_method, 
            p.payment_date,
            p.payment_id
        FROM payment p
        JOIN family f ON p.family_id = f.family_id
        JOIN family_member fm ON f.family_id = fm.family_id 
        WHERE fm.role = 'family_admin' 
        ORDER BY p.payment_date DESC`;

    db.query(sql, (err, paidFamilies) => {
        if (err) {
            console.error("Fetch Paid Error:", err);
            return res.render('paid', { paidFamilies: [], error: "Error fetching paid records." });
        }

        res.render('paid', { 
            paidFamilies: paidFamilies,
            error: null 
        });
    });
});

// lists of Family Unpaid
app.get('/unpaid', (req, res) => {
    const adminId = req.session.adminId;
    if (!adminId) return res.redirect('/index');

    // SQL to find families that have NO records in the payment table
    const sql = `
        SELECT 
            f.family_id,
            f.family_name, 
            fm.first_name, 
            fm.last_name, 
            fm.phone,
            (SELECT MAX(payment_date) FROM payment WHERE family_id = f.family_id) as last_payment_date
        FROM family f
        JOIN family_member fm ON f.family_id = fm.family_id
        LEFT JOIN payment p ON f.family_id = p.family_id
        WHERE fm.role = 'family_admin' 
        AND p.payment_id IS NULL
        ORDER BY f.created_at DESC`;

    db.query(sql, (err, unpaidFamilies) => {
        if (err) {
            console.error("Fetch Unpaid Error:", err);
            return res.render('unpaid', { unpaidFamilies: [], error: "Error fetching unpaid families." });
        }

        res.render('unpaid', { 
            unpaidFamilies: unpaidFamilies,
            error: null 
        });
    });
});

app.post('/send-payment-reminder', async (req, res) => {
    const { phone, familyName } = req.body;
    const adminId = req.session.adminId;

    if (!adminId) return res.status(401).json({ success: false, message: "Unauthorized" });

    // The message you requested in Swahili
    const message = `Habari! Huu ni ukumbusho wa kulipia kifurushi chako cha familia ya ${familyName} ili uendelee kufurahia mfumo wetu, kufahamu asili ya ukoo wako na shughuli nyingine za kifamilia.`;

    // Beem Auth (Using your provided keys)
    const auth = Buffer.from('7296068691500366:NmZjN2I0Njg5YTA5YWEyY2E2YmY1ZTZlOTY3ZTM0ZDA4ODgyNjkyYjk2OTdmNjlkMTY1OWZjZTE0MjAwZjRkMg==').toString('base64');

    try {
        await axios.post('https://apisms.beem.africa/v1/send', {
            source_addr: 'AFYASTOCK', 
            message: message,
            schedule_time: '',
            encoding: '0',
            recipients: [{ 
                recipient_id: 1, 
                dest_addr: phone 
            }]
        }, { 
            headers: { 
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json'
            } 
        });

        res.json({ success: true });
    } catch (error) {
        console.error("Beem SMS Reminder Failed:", error.response ? error.response.data : error.message);
        res.status(500).json({ success: false, message: "SMS Gateway Error" });
    }
});

// Grant Access
app.get('/grant_access', (req, res) => {
    const adminId = req.session.adminId;
    const adminName = req.session.adminName; 

    if (!adminId) return res.redirect('/index');

    const sql = `
        SELECT f.family_id, f.family_name, fm.first_name, fm.last_name, fm.phone, p.amount
        FROM family f
        JOIN payment p ON f.family_id = p.family_id
        JOIN family_member fm ON f.family_id = fm.family_id
        WHERE fm.role = 'family_admin'
        ORDER BY p.payment_date DESC`;

    db.query(sql, (err, results) => {
        if (err) {
            console.error(err);
            return res.render('grant_access', { 
                paidFamilies: [], 
                // Ondoa familyCount hapa ili itumie ile ya middleware
            }); 
        }

        res.render('grant_access', { 
            paidFamilies: results || []
            // Ondoa familyCount hapa ili itumie ile ya middleware
        });
    });
});

app.post('/save-family-access', (req, res) => {
    const { family_id, permissions } = req.body;
    
    // permissions will be an array of strings (e.g., ['meetings', 'drive'])
    // We convert it to a comma-separated string for the database
    const permsString = Array.isArray(permissions) ? permissions.join(',') : permissions;

    const sql = "UPDATE family SET permissions = ? WHERE family_id = ?";
    
    db.query(sql, [permsString, family_id], (err, result) => {
        if (err) {
            console.error(err);
            return res.redirect('/grant_access?error=Failed to update');
        }
        res.redirect('/grant_access?success=Access updated successfully');
    });
});

// Revoke Access
app.get('/revoke_access', (req, res) => {
    const adminId = req.session.adminId;
    if (!adminId) return res.redirect('/index');

    // Tunatafuta familia ambazo tayari zina permissions (haziko null)
    const sql = `
        SELECT f.family_id, f.family_name, fm.first_name, fm.last_name, fm.phone 
        FROM family f
        JOIN family_member fm ON f.family_id = fm.family_id
        WHERE fm.role = 'family_admin' 
        AND f.permissions IS NOT NULL 
        AND f.permissions != ''
        ORDER BY f.family_name ASC`;

    db.query(sql, (err, results) => {
        if (err) {
            console.error(err);
            return res.render('revoke_access', { activeFamilies: [] });
        }
        res.render('revoke_access', { activeFamilies: results || [] });
    });
});

// Route ya kufanya Revoke (Kutoa Access)
app.post('/confirm-revoke', (req, res) => {
    const { family_id } = req.body;
    
    // Tunafuta permissions kwa kuifanya iwe NULL
    const sql = "UPDATE family SET permissions = NULL WHERE family_id = ?";
    
    db.query(sql, [family_id], (err, result) => {
        if (err) {
            console.error(err);
            return res.redirect('/revoke_access?error=Failed to revoke access');
        }
        res.redirect('/revoke_access?success=Access revoked successfully');
    });
});

app.use((req, res, next) => {
    // 1. INAWEZESHA TOAST: Inasoma ujumbe kutoka kwenye URL na kuuweka kwenye res.locals
    res.locals.success = req.query.success || null;
    res.locals.error = req.query.error || null;

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


// Register Users
app.get('/user', (req, res) => {
  res.render('user'); // Admin
});


// Route ya kupokea usajili wa User mpya
app.post('/register-system-user', async (req, res) => {
    const { full_name, email, phone, role, password, confirm_password } = req.body;

    // 1. Validations za haraka
    if (password !== confirm_password) {
        return res.redirect('/user?error=Passwords do not match');
    }

    try {
        // 2. Ficha password (Hashing)
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // 3. SQL Query (Jina la table ni system_admin kulingana na picha yako)
        const sql = `INSERT INTO system_admin (role, full_name, email, phone, password) VALUES (?, ?, ?, ?, ?)`;
        const values = [role, full_name, email, phone, hashedPassword];

        db.query(sql, values, (err, result) => {
            if (err) {
                console.error("Registration Error:", err);
                if (err.code === 'ER_DUP_ENTRY') {
                    return res.redirect('/user?error=Email already registered');
                }
                return res.redirect('/user?error=Database error occurred');
            }
            
            res.redirect('/user?success=System user registered successfully');
        });

    } catch (error) {
        console.error(error);
        res.redirect('/user?error=Something went wrong');
    }
});

// Lists of users
app.get('/lists_user', (req, res) => {
    const query = "SELECT * FROM system_admin ORDER BY created_at DESC";
    
    // Extract parameters from the URL query string
    const status = req.query.status;
    const message = req.query.message;

    db.query(query, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Database Error");
        }

        res.render('lists_user', { 
            users: results,
            // Map the query params to the variables used in your partial
            success: status === 'success' ? message : null,
            error: status === 'error' ? message : null
        });
    });
});
// --- Update System Admin ---
app.post('/update_user', (req, res) => {
    const { admin_id, full_name, email, role, phone } = req.body;
    const sql = "UPDATE system_admin SET full_name = ?, email = ?, role = ?, phone = ? WHERE admin_id = ?";
    
    db.query(sql, [full_name, email, role, phone, admin_id], (err, result) => {
        if (err) {
            return res.redirect('/lists_user?status=error&message=Update failed');
        }
        res.redirect('/lists_user?status=success&message=User updated successfully');
    });
});

// reports for admin
app.get('/report', async (req, res) => {
    const adminId = req.session.adminId;
    if (!adminId) return res.redirect('/index');

    try {
        const queries = {
            today: "SELECT COUNT(*) AS count FROM family WHERE DATE(created_at) = CURDATE()",
            month: "SELECT COUNT(*) AS count FROM family WHERE MONTH(created_at) = MONTH(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE())",
            year: "SELECT COUNT(*) AS count FROM family WHERE YEAR(created_at) = YEAR(CURDATE())",
            total: "SELECT COUNT(*) AS count FROM family",
            paid: "SELECT COUNT(DISTINCT family_id) AS count FROM payment",
            accessGranted: "SELECT COUNT(*) AS count FROM family WHERE permissions IS NOT NULL AND permissions != ''",
            revoked: "SELECT COUNT(*) AS count FROM family WHERE permissions IS NULL OR permissions = ''",
            users: "SELECT COUNT(*) AS count FROM admin" // Hakikisha table inaitwa 'admin'
        };

        // Kazi ya kusaidia kurudisha 0 kama query ikifeli
        const runQuery = (sql) => {
            return new Promise((resolve) => {
                db.query(sql, (err, r) => {
                    if (err || !r || r.length === 0) {
                        resolve(0); // Rudisha 0 kama kuna kosa
                    } else {
                        resolve(r[0].count || 0);
                    }
                });
            });
        };

        const [today, month, year, total, paid, granted, revoked, users] = await Promise.all([
            runQuery(queries.today),
            runQuery(queries.month),
            runQuery(queries.year),
            runQuery(queries.total),
            runQuery(queries.paid),
            runQuery(queries.accessGranted),
            runQuery(queries.revoked),
            runQuery(queries.users)
        ]);

        const stats = {
            today, month, year, total,
            paid,
            unpaid: Math.max(0, total - paid),
            granted,
            revoked,
            users,
            dateGenerated: new Date().toISOString().split('T')[0]
        };

        res.render('report', { stats });

    } catch (error) {
        console.error("Report Generation Error:", error);
        res.status(500).send("Tulipata tatizo kutengeneza ripoti.");
    }
});

// user profile.ejs
app.get('/users-profile', (req, res) => {
    const adminId = req.session.adminId; 
    const sql = "SELECT * FROM system_admin WHERE admin_id = ?";

    const status = req.query.status;
    const message = req.query.message;

    db.query(sql, [adminId], (err, results) => {
        if (err || results.length === 0) return res.redirect('/index');
        
        const admin = results[0];
        res.render('users-profile', {
            adminName: admin.full_name,
            adminPhone: admin.phone || 'N/A',
            adminEmail: admin.email || 'N/A',
            adminRole: admin.role,
            // Genealogy Context
            systemTitle: "Family Genealogy System",
            // Notifications for your toast partial
            success: status === 'success' ? message : null,
            error: status === 'error' ? message : null
        });
    });
});

app.post('/update-profile', (req, res) => {
    const { fullName, phone, email } = req.body;
    const adminId = req.session.adminId;

    const sql = "UPDATE system_admin SET full_name = ?, phone = ?, email = ? WHERE admin_id = ?";
    
    db.query(sql, [fullName, phone, email, adminId], (err) => {
        if (err) {
            return res.redirect('/users-profile?status=error&message=Update failed');
        }
        res.redirect('/users-profile?status=success&message=Profile updated successfully');
    });
});


app.post('/password', async (req, res) => {
    const { currentPassword, newPassword, confirmNewPassword } = req.body;
    const adminId = req.session.adminId;

    if (newPassword !== confirmNewPassword) {
        return res.redirect('/users-profile?status=error&message=New passwords do not match');
    }

    // 1. Get current hashed password from DB
    db.query("SELECT password FROM system_admin WHERE admin_id = ?", [adminId], async (err, results) => {
        if (err || results.length === 0) return res.redirect('/users-profile?status=error&message=User not found');

        const userPassword = results[0].password;

        // 2. Compare currentPassword with hashed password
        const isMatch = await bcrypt.compare(currentPassword, userPassword);
        if (!isMatch) {
            return res.redirect('/users-profile?status=error&message=Current password is incorrect');
        }

        // 3. Hash new password and update
        const hashedNewPassword = await bcrypt.hash(newPassword, 10);
        db.query("UPDATE system_admin SET password = ? WHERE admin_id = ?", [hashedNewPassword, adminId], (err) => {
            if (err) return res.redirect('/users-profile?status=error&message=Password update failed');
            res.redirect('/users-profile?status=success&message=Password changed successfully');
        });
    });
});


// header.ejs
app.get('/header', (req, res) => {
  res.render('header'); // Admin
});


// Head of family Dashboard
app.get('/family_admin', (req, res) => {
  const family_id = req.session.family_id;

  // ✅ Real SQL queries
  const membersQuery = `
    SELECT COUNT(*) AS total_members
    FROM family_member
    WHERE family_id = ?
  `;

  const adultsQuery = `
    SELECT COUNT(*) AS total_adults
    FROM family_member
    WHERE family_id = ? AND role = 'member'
  `;

  const meetingsQuery = `
    SELECT COUNT(*) AS total_meetings
    FROM meeting
    WHERE family_id = ? AND meeting_date >= CURDATE()
  `;

  const ageQuery = `
    SELECT
      SUM(CASE WHEN TIMESTAMPDIFF(YEAR, date_of_birth, CURDATE()) BETWEEN 0 AND 10 THEN 1 ELSE 0 END) AS age_0_10,
      SUM(CASE WHEN TIMESTAMPDIFF(YEAR, date_of_birth, CURDATE()) BETWEEN 11 AND 20 THEN 1 ELSE 0 END) AS age_11_20,
      SUM(CASE WHEN TIMESTAMPDIFF(YEAR, date_of_birth, CURDATE()) BETWEEN 21 AND 40 THEN 1 ELSE 0 END) AS age_21_40,
      SUM(CASE WHEN TIMESTAMPDIFF(YEAR, date_of_birth, CURDATE()) BETWEEN 41 AND 60 THEN 1 ELSE 0 END) AS age_41_60,
      SUM(CASE WHEN TIMESTAMPDIFF(YEAR, date_of_birth, CURDATE()) > 60 THEN 1 ELSE 0 END) AS age_60_plus
    FROM family_member
    WHERE family_id = ?
  `;

  const familyMembersQuery = `
    SELECT first_name, last_name, role, is_future_head, created_at
    FROM family_member
    WHERE family_id = ?
    ORDER BY created_at DESC
  `;

  const recentActivitiesQuery = `
    SELECT 'member' AS type, CONCAT(first_name, ' ', last_name) AS name, created_at AS activity_time
    FROM family_member
    WHERE family_id = ?
    ORDER BY created_at DESC
    LIMIT 5
  `;

  // Execute all queries
  db.query(membersQuery, [family_id], (err, membersResult) => {
    if (err) throw err;

    db.query(adultsQuery, [family_id], (err, adultsResult) => {
      if (err) throw err;

      db.query(meetingsQuery, [family_id], (err, meetingsResult) => {
        if (err) throw err;

        db.query(ageQuery, [family_id], (err, ageResult) => {
          if (err) throw err;

          db.query(familyMembersQuery, [family_id], (err, familyMembers) => {
            if (err) throw err;

            db.query(recentActivitiesQuery, [family_id], (err, recentActivities) => {
              if (err) throw err;

              res.render('family_admin', {
                totalMembers: membersResult[0].total_members,
                totalAdults: adultsResult[0].total_adults,
                totalMeetings: meetingsResult[0].total_meetings,

                age_0_10: ageResult[0].age_0_10 || 0,
                age_11_20: ageResult[0].age_11_20 || 0,
                age_21_40: ageResult[0].age_21_40 || 0,
                age_41_60: ageResult[0].age_41_60 || 0,
                age_60_plus: ageResult[0].age_60_plus || 0,

                familyMembers,
                recentActivities
              });

            });
          });
        });
      });
    });
  });
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
