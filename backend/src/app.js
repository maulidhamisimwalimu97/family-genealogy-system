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

const multer = require('multer');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // '../' inarudi nyuma kutoka 'src' kwenda 'backend'
        // Kisha inaingia kwenye 'public/uploads/drives/'
        const fullPath = path.join(__dirname, '../public/uploads/drives/');
        
        // Hakikisha folder lipo, kama halipo litengeneze
        if (!fs.existsSync(fullPath)) {
            fs.mkdirSync(fullPath, { recursive: true });
        }
        
        cb(null, fullPath);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// --- 2. SETTINGS & VIEW ENGINE ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../../frontend/views'));

// --- 3. MIDDLEWARE ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 1. Ruhusu ufikiaji wa mafaili yaliyopakiwa (Images, PDFs, n.k.)
// Hii inaunganisha URL ya /uploads na folder halisi la backend/public/uploads
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

// 2. Ruhusu ufikiaji wa folder la frontend (HTML, CSS, JS ya kule mbele)
app.use(express.static(path.join(__dirname, '../../frontend')));

// Global Cache Control (Prevents back-button access after logout)
app.use((req, res, next) => {
    res.set('Cache-Control', 'no-cache, private, no-store, must-revalidate, max-stale=0, post-check=0, pre-check=0');
    next();
});

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

// ===== GLOBAL DATA MIDDLEWARE =====
app.use((req, res, next) => {
  const memberId = req.session.member_id;
  const familyId = req.session.family_id;

  // Default values (avoid EJS crash)
  res.locals.profile = { first_name: 'User', last_name: '', role: '' };
  res.locals.notifications = [];
  res.locals.totalNotifications = 0;

  if (!memberId || !familyId) return next();

  // 🔹 Profile
  const profileQuery = `
    SELECT first_name, last_name, role
    FROM family_member
    WHERE member_id = ?
    LIMIT 1
  `;

  // 🔹 Notifications
  const notificationsQuery = `
    SELECT title, created_at
    FROM notifications
    WHERE family_id = ?
    ORDER BY created_at DESC
    LIMIT 5
  `;

  db.query(profileQuery, [memberId], (err, profileResult) => {
    if (!err && profileResult.length > 0) {
      res.locals.profile = profileResult[0];
    }

    db.query(notificationsQuery, [familyId], (err2, notifications) => {
      if (!err2 && notifications) {
        res.locals.notifications = notifications;
        res.locals.totalNotifications = notifications.length;
      }

      next();
    });
  });
});

// Login page
app.get('/index', (req, res) => {
    res.render('index', { error: null });
});

// Login process
app.post('/index', (req, res) => {
  const { phone, password } = req.body;

  // 1️⃣ Check system_admin first
  const adminQuery = "SELECT * FROM system_admin WHERE phone = ? LIMIT 1";

  db.query(adminQuery, [phone], async (err, adminResult) => {
    if (err) {
      console.log(err);
      return res.render('index', { error: "Server error" });
    }

    // ✅ If found in system_admin
    if (adminResult.length > 0) {
      const admin = adminResult[0];
      const match = await bcrypt.compare(password, admin.password);

      if (!match) {
        return res.render('index', { error: "Incorrect password" });
      }

      // Login success (System Admin)
      req.session.adminId = admin.admin_id;
      req.session.adminName = admin.full_name;

      return res.redirect('/Admin');
    }

    // 2️⃣ If not system_admin → check family_member (family_admin)
    const familyQuery = `
      SELECT * FROM family_member 
      WHERE phone = ? AND role = 'family_admin' 
      LIMIT 1
    `;

    db.query(familyQuery, [phone], async (err, familyResult) => {
      if (err) {
        console.log(err);
        return res.render('index', { error: "Server error" });
      }

      if (familyResult.length === 0) {
        return res.render('index', { error: "Phone number not found" });
      }

      const user = familyResult[0];
      const match = await bcrypt.compare(password, user.password);

      if (!match) {
        return res.render('index', { error: "Incorrect password" });
      }

      // ✅ Login success (Family Admin)
      req.session.family_id = user.family_id;
      req.session.member_id = user.member_id;
      req.session.member_name = user.first_name + " " + user.last_name;

      return res.redirect('/family_admin');
    });
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

    // 1. Kuchukua data kutoka kwenye form
    const { 
        family_name, tribe, region, religion, address, 
        first_name, middle_name, last_name, phone, email, gender 
    } = req.body;

    const getCountAndRender = (errorMsg, successMsg) => {
        const countSql = "SELECT COUNT(*) AS totalFamilies FROM family WHERE registered_by = ?";
        db.query(countSql, [adminId], (err, countResult) => {
            const familyCount = (!err && countResult.length > 0) ? countResult[0].totalFamilies : 0;
            res.render('register', { 
                adminName,
                familyCount,
                error: errorMsg, 
                success: successMsg 
            });
        });
    };

    if (!family_name || !first_name || !phone) {
        return getCountAndRender('Tafadhali jaza sehemu zote muhimu.', null);
    }

    // 2. Safisha namba ya simu (FormattedPhone kwa ajili ya DB na Recipient)
    let formattedPhone = phone.replace(/\D/g, ''); 
    if (formattedPhone.startsWith('0')) {
        formattedPhone = '255' + formattedPhone.substring(1);
    } else if (!formattedPhone.startsWith('255')) {
        formattedPhone = '255' + formattedPhone;
    }

    // Hii itatumika kuonyesha Username kwenye message kwa usahihi
    const formattedUsername = formattedPhone;

    try {
        db.query("SELECT member_id FROM family_member WHERE phone = ? LIMIT 1", [formattedPhone], async (err, result) => {
            if (err) return getCountAndRender('Database error checking phone', null);
            if (result && result.length > 0) return getCountAndRender('Namba hii tayari imesajiliwa.', null);

            // Tengeneza Password ya nasibu (Random)
            const plainPassword = crypto.randomBytes(3).toString('hex'); 
            const hashedPassword = await bcrypt.hash(plainPassword, 10);

            // 3. Save Family Data
            const familySql = `INSERT INTO family (family_name, tribe, region, religion, address, phone, registered_by, permissions) VALUES (?, ?, ?, ?, ?, ?, ?, '')`;
            db.query(familySql, [family_name, tribe, region, religion || null, address || null, formattedPhone, adminId], (err2, familyResult) => {
                if (err2) {
                    console.error("Family Insert Error:", err2);
                    return getCountAndRender('Error saving family data.', null);
                }

                const familyId = familyResult.insertId;

                // 4. Save Admin Member
                const memberSql = `INSERT INTO family_member (family_id, first_name, middle_name, last_name, gender, phone, email, role, password) VALUES (?, ?, ?, ?, ?, ?, ?, 'family_admin', ?)`;
                
                db.query(memberSql, [
                    familyId, 
                    first_name, 
                    middle_name || '', 
                    last_name, 
                    gender || 'Other', 
                    formattedPhone, 
                    email || '', 
                    hashedPassword
                ], async (err3) => {
                    if (err3) {
                        console.error("Member Insert Error:", err3);
                        return getCountAndRender('Error saving admin member.', null);
                    }

                    // 5. TegaSMS Configuration & Message Styling
                    const apiToken = '2|ZDVZgBsVfuBbhCRnFf5N9jmYsG7JLPtoXACoqLQO88f41331';
                    
                    // Ujumbe uliopangwa vizuri kwa nafasi (Spacing)
                    const smsMessage = `Habari ${first_name}, 

                    Hongera! Familia ya ${family_name} imesajiliwa kikamilifu.

                    TAARIFA ZAKO ZA KUINGIA:
                    Username: ${formattedUsername}
                    Neno la Siri: ${plainPassword}

                    Ingia hapa: http://localhost:5000/

                    Tafadhali badili neno la siri mara tu utakapoingia kwa usalama wa akaunti yako.`;

                    const smsData = {
                        "from": "FamilyHub", 
                        "recipient": formattedPhone,
                        "message": smsMessage,
                        "channel": "1010105"
                    };

                    // Tuma SMS kupitia Axios
                    axios.post('https://tegasms.teganas.co.tz/api/v1/send_sms/type/single', smsData, {
                        headers: {
                            'Authorization': `Bearer ${apiToken}`,
                            'Content-Type': 'application/json'
                        }
                    }).then(res => console.log("SMS Success:", res.data))
                      .catch(e => console.error("SMS API Error:", e.response ? e.response.data : e.message));

                    // 6. Success Response kwa Admin
                    getCountAndRender(null, `Familia ya ${family_name} imesajiliwa kikamilifu!`);
                });
            });
        });
    } catch (error) {
        console.error("General Error:", error);
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
// --- GET: Head of Family Dashboard ---
app.get('/family_admin', (req, res) => {
  const family_id = req.session.family_id;
  const member_id = req.session.member_id;

  if (!family_id || !member_id) return res.redirect('/index');

  // 🔹 Queries
  const profileQuery = `
    SELECT first_name, last_name, role
    FROM family_member
    WHERE member_id = ?
    LIMIT 1
  `;

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
    WHERE created_by = ? AND meeting_date >= CURDATE()
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
    SELECT 'member' AS type,
           CONCAT(first_name, ' ', last_name) AS name,
           created_at AS activity_time
    FROM family_member
    WHERE registered_by = ?
    ORDER BY created_at DESC
    LIMIT 5
  `;

  // 🔹 Notifications = latest 5 activities (member registrations + meetings)
  const notificationsQuery = `
    SELECT 'member' AS type, CONCAT(first_name, ' ', last_name) AS title, created_at
    FROM family_member
    WHERE registered_by = ?
    UNION
    SELECT 'meeting' AS type, title, created_at
    FROM meeting
    WHERE created_by = ?
    ORDER BY created_at DESC
    LIMIT 5
  `;

  // 🚀 Execute queries sequentially
  db.query(profileQuery, [member_id], (err, profileResult) => {
    if (err) throw err;
    const profile = profileResult[0] || { first_name: 'User', last_name: '', role: '' };

    db.query(membersQuery, [family_id], (err, membersResult) => {
      if (err) throw err;

      db.query(adultsQuery, [family_id], (err, adultsResult) => {
        if (err) throw err;

        db.query(meetingsQuery, [member_id], (err, meetingsResult) => {
          if (err) throw err;

          db.query(ageQuery, [family_id], (err, ageResult) => {
            if (err) throw err;

            db.query(familyMembersQuery, [family_id], (err, familyMembers) => {
              if (err) throw err;

              db.query(recentActivitiesQuery, [member_id], (err, recentActivities) => {
                if (err) throw err;

                db.query(notificationsQuery, [member_id, member_id], (err, notifications) => {
                  if (err) notifications = [];

                  const totalNotifications = notifications.length;

                  // ✅ Render EJS with all dynamic data
                  res.render('family_admin', {
                    profile,
                    totalMembers: membersResult[0].total_members,
                    totalAdults: adultsResult[0].total_adults,
                    totalMeetings: meetingsResult[0].total_meetings,
                    age_0_10: ageResult[0].age_0_10 || 0,
                    age_11_20: ageResult[0].age_11_20 || 0,
                    age_21_40: ageResult[0].age_21_40 || 0,
                    age_41_60: ageResult[0].age_41_60 || 0,
                    age_60_plus: ageResult[0].age_60_plus || 0,
                    familyMembers,
                    recentActivities,
                    notifications,       // Latest activities as notifications
                    totalNotifications   // Count for badge
                  });
                });
              });
            });
          });
        });
      });
    });
  });
});

// --- GET: Render Register Family Member Form ---
app.get('/register_family', (req, res) => {
    const familyId = req.session.family_id;
    const memberId = req.session.member_id;

    if (!familyId || !memberId) return res.redirect('/index');

    // 🔹 Profile of logged-in user
    const profileQuery = `
        SELECT first_name, last_name, role
        FROM family_member
        WHERE member_id = ?
        LIMIT 1
    `;

    // 🔹 Notifications = latest 5 activities (member registrations + meetings)
    const notificationsQuery = `
        SELECT 'member' AS type, CONCAT(first_name, ' ', last_name) AS title, created_at
        FROM family_member
        WHERE registered_by = ?
        UNION
        SELECT 'meeting' AS type, title, created_at
        FROM meeting
        WHERE created_by = ?
        ORDER BY created_at DESC
        LIMIT 5
    `;

    // 🔹 Total members count
    const membersCountQuery = `
        SELECT COUNT(*) AS totalMembers
        FROM family_member
        WHERE family_id = ?
    `;

    // 🚀 Execute queries
    db.query(profileQuery, [memberId], (err, profileResult) => {
        if (err) throw err;
        const profile = profileResult[0] || { first_name: 'User', last_name: '', role: '' };

        db.query(notificationsQuery, [memberId, memberId], (err2, notifications) => {
            if (err2) notifications = [];

            const totalNotifications = notifications.length; // count for badge

            db.query(membersCountQuery, [familyId], (err3, countResult) => {
                const totalMembers = (!err3 && countResult.length > 0) ? countResult[0].totalMembers : 0;

                // Render EJS template with all dynamic data
                res.render('register_family', {
                    profile,
                    notifications,
                    totalNotifications,
                    totalMembers,
                    error: null,
                    success: null
                });
            });
        });
    });
});

app.post('/register-member', async (req, res) => {
  const familyId = req.session.family_id;
  const adminId = req.session.member_id;

  if (!familyId || !adminId) return res.redirect('/index');

  const { 
    first_name, middle_name, last_name, gender, date_of_birth, 
    phone, email, relationship, branch_type 
  } = req.body;

  const renderPage = (errorMsg, successMsg) => {
    res.render('register_family', {
      error: errorMsg,
      success: successMsg
    });
  };

  // 🔹 Validation
  if (!first_name || !last_name || !gender || !date_of_birth || !phone || !relationship || !branch_type) {
    return renderPage('Tafadhali jaza sehemu zote zenye nyota (*)', null);
  }

  const formattedPhone = phone.replace(/\s+/g, '');

  try {
    // 🔹 Check duplicate phone
    db.query("SELECT member_id FROM family_member WHERE phone = ? LIMIT 1", [formattedPhone], async (err, result) => {
      if (err) return renderPage('Database error checking phone.', null);
      if (result.length > 0) return renderPage('Namba hii tayari imesajiliwa.', null);

      // 🔹 Generate password
      const plainPassword = crypto.randomBytes(3).toString('hex');
      const hashedPassword = await bcrypt.hash(plainPassword, 10);

      // 🔹 Age check
      const dob = new Date(date_of_birth);
      const today = new Date();
      let age = today.getFullYear() - dob.getFullYear();
      if (today.getMonth() < dob.getMonth() || 
         (today.getMonth() === dob.getMonth() && today.getDate() < dob.getDate())) {
        age--;
      }

      const role = age < 18 ? 'dependent' : 'member';

      // 🔹 Insert member
      const insertSql = `
        INSERT INTO family_member 
        (family_id, first_name, middle_name, last_name, gender, date_of_birth, phone, email, role, password, registered_by, relationship, branch_type, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `;

      const values = [
        familyId,
        first_name,
        middle_name || null,
        last_name,
        gender.toLowerCase(),
        date_of_birth,
        formattedPhone,
        email || null,
        role,
        hashedPassword,
        adminId,
        relationship,
        branch_type
      ];

      db.query(insertSql, values, (err2) => {
        if (err2) return renderPage('Error saving member.', null);

        // 🔹 Insert notification
        const notifSql = `
          INSERT INTO notifications (family_id, title, message, created_at)
          VALUES (?, ?, ?, NOW())
        `;
        db.query(notifSql, [
          familyId,
          'Mwanachama Mpya',
          `${first_name} ${last_name} amesajiliwa kwenye familia.`
        ]);

        // 🔹 SMS (optional)
        const smsMessage = `
Karibu kwenye Mfumo wa Family Genealogy!

Username: ${formattedPhone}
Password: ${plainPassword}
        `;

        const auth = Buffer.from('YOUR_API_KEY').toString('base64');

        axios.post('https://apisms.beem.africa/v1/send', {
          source_addr: 'FAMILYGEN',
          message: smsMessage,
          recipients: [{ recipient_id: 1, dest_addr: formattedPhone }]
        }, {
          headers: { Authorization: `Basic ${auth}` }
        }).catch(() => {});

        return renderPage(null, `Mwanachama ${first_name} ${last_name} amesajiliwa kikamilifu!`);
      });
    });

  } catch (error) {
    renderPage('Something went wrong.', null);
  }
});

// lists of family member
// --- GET: Family Members List ---
app.get('/family_lists', (req, res) => {
    const familyId = req.session.family_id; 
    const memberId = req.session.member_id;

    if (!familyId || !memberId) return res.redirect('/index');

    // ✅ CHUKUA SUCCESS NA ERROR KUTOKA KWENYE SESSION
    const success = req.session.success;
    const error = req.session.error;

    // ❗ FUTA BAADA YA KUSOMA ILI ISITOKEE TENA UKIREFRESH
    req.session.success = null;
    req.session.error = null;

    const profileQuery = `SELECT first_name, last_name, role FROM family_member WHERE member_id = ? LIMIT 1`;
    
    const notificationsQuery = `
        SELECT 'member' AS type, CONCAT(first_name, ' ', last_name) AS title, created_at FROM family_member WHERE registered_by = ?
        UNION
        SELECT 'meeting' AS type, title, created_at FROM meeting WHERE created_by = ?
        ORDER BY created_at DESC LIMIT 5`;

    const membersQuery = `
        SELECT member_id, CONCAT(first_name, ' ', middle_name, ' ', last_name) AS full_name, 
        gender, relationship, role, phone, branch_type 
        FROM family_member WHERE family_id = ? ORDER BY created_at DESC`;

    db.query(profileQuery, [memberId], (err, profileResult) => {
        if (err) throw err;
        const profile = profileResult[0] || { first_name: 'User', last_name: '', role: '' };

        db.query(notificationsQuery, [memberId, memberId], (err2, notifications) => {
            const totalNotifications = err2 ? 0 : notifications.length;

            db.query(membersQuery, [familyId], (err3, members) => {
                res.render('family_lists', {
                    profile,
                    notifications,
                    totalNotifications,
                    members,
                    success, // Inatumwa kwenye notifications.ejs
                    error    // Inatumwa kwenye notifications.ejs
                });
            });
        });
    });
});

// --- PUT: Update Member ---
app.put('/update-member/:id', (req, res) => {
    const memberId = req.params.id;
    const { name, phone } = req.body;
    const familyId = req.session.family_id;

    if (!familyId) return res.json({ success: false });

    const names = name.split(' ');
    const first_name = names[0] || '';
    const last_name = names.slice(1).join(' ') || '';

    const sql = `UPDATE family_member SET first_name = ?, last_name = ?, phone = ? WHERE member_id = ? AND family_id = ?`;

    db.query(sql, [first_name, last_name, phone, memberId, familyId], (err) => {
        if (err) {
            req.session.error = "Update failed. Please try again.";
            return res.json({ success: false });
        }
        // ✅ SET SESSION SUCCESS
        req.session.success = "Member details updated successfully!";
        res.json({ success: true });
    });
});

// --- DELETE: Member ---
app.delete('/delete-member/:id', (req, res) => {
    const memberId = req.params.id;
    const familyId = req.session.family_id;

    const sql = "DELETE FROM family_member WHERE member_id = ? AND family_id = ?";
    db.query(sql, [memberId, familyId], (err) => {
        if (err) {
            req.session.error = "Could not delete member.";
            return res.json({ success: false });
        }
        // ✅ SET SESSION SUCCESS
        req.session.success = "Member has been removed from the list.";
        res.json({ success: true });
    });
});

// --- GET: Family Tree ---
app.get('/family_tree', (req, res) => {
  const familyId = req.session.family_id;
  const memberId = req.session.member_id;

  if (!familyId || !memberId) return res.redirect('/index');

  // 🔹 Profile
  const profileQuery = `
    SELECT first_name, last_name, role
    FROM family_member
    WHERE member_id = ?
    LIMIT 1
  `;

  // 🔹 Notifications (same logic you used before ✅)
  const notificationsQuery = `
    SELECT 'member' AS type, CONCAT(first_name, ' ', last_name) AS title, created_at
    FROM family_member
    WHERE registered_by = ?
    UNION
    SELECT 'meeting' AS type, title, created_at
    FROM meeting
    WHERE created_by = ?
    ORDER BY created_at DESC
    LIMIT 5
  `;

  // 🔹 Family members (tree)
  const membersQuery = `
    SELECT member_id, first_name, last_name, role, relationship, branch_type, is_future_head
    FROM family_member
    WHERE family_id = ?
    ORDER BY created_at ASC
  `;

  // 🚀 RUN QUERIES
  db.query(profileQuery, [memberId], (err, profileResult) => {
    if (err) throw err;
    const profile = profileResult[0] || { first_name: 'User', last_name: '', role: '' };

    db.query(notificationsQuery, [memberId, memberId], (err2, notifications) => {
      if (err2) notifications = [];

      const totalNotifications = notifications.length; // ✅ FIX

      db.query(membersQuery, [familyId], (err3, members) => {
        if (err3) members = [];

        // 🔹 Find founder
        const founder = members.find(m => m.role === 'family_admin');

        // 🔹 Group by branch
        const branches = {};
        members.forEach(member => {
          if (!branches[member.branch_type]) {
            branches[member.branch_type] = [];
          }
          branches[member.branch_type].push(member);
        });

        // ✅ SEND EVERYTHING TO EJS
        res.render('family_tree', {
          profile,
          notifications,
          totalNotifications, // 🔥 IMPORTANT FIX
          founder,
          branches
        });
      });
    });
  });
});

// --- GET: Schedule Page ---
app.get('/schedule', (req, res) => {
    const familyId = req.session.family_id;
    const memberId = req.session.member_id;

    if (!familyId || !memberId) return res.redirect('/index');

    // Profile & Notifications Queries (Kama ilivyo kwenye kurasa nyingine)
    const profileQuery = `SELECT first_name, last_name, role FROM family_member WHERE member_id = ? LIMIT 1`;
    const notificationsQuery = `
        SELECT 'member' AS type, CONCAT(first_name, ' ', last_name) AS title, created_at FROM family_member WHERE registered_by = ?
        UNION
        SELECT 'meeting' AS type, title, created_at FROM meeting WHERE created_by = ?
        ORDER BY created_at DESC LIMIT 5`;

    db.query(profileQuery, [memberId], (err, profileRes) => {
        const profile = profileRes[0] || { first_name: 'User' };
        db.query(notificationsQuery, [memberId, memberId], (err2, notifications) => {
            res.render('schedule', {
                profile,
                notifications,
                totalNotifications: notifications.length,
                success: req.session.success, // ✅ Soma toast
                error: req.session.error
            });
            req.session.success = null;
            req.session.error = null;
        });
    });
});

// --- POST: Save Meeting ---
app.post('/schedule-meeting', (req, res) => {
    const { title, description, meeting_date, meeting_time, location } = req.body;
    const family_id = req.session.family_id;
    const created_by = req.session.member_id;

    if (!family_id) return res.status(403).json({ success: false });

    const sql = `
        INSERT INTO meeting (family_id, title, description, meeting_date, meeting_time, location, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)`;

    db.query(sql, [family_id, title, description, meeting_date, meeting_time, location, created_by], (err, result) => {
        if (err) {
            console.error(err);
            return res.json({ success: false });
        }
        
        // Weka ujumbe wa mafanikio kwenye session
        req.session.success = "Meeting scheduled successfully!";
        res.json({ success: true });
    });
});

// --- GET: Meeting List Page ---
app.get('/meeting_list', (req, res) => {
    const familyId = req.session.family_id;
    const memberId = req.session.member_id;

    if (!familyId || !memberId) return res.redirect('/index');

    const profileQuery = `SELECT first_name, last_name, role FROM family_member WHERE member_id = ? LIMIT 1`;
    const meetingsQuery = `SELECT * FROM meeting WHERE family_id = ? ORDER BY meeting_date DESC`;
    const notificationsQuery = `
        SELECT 'member' AS type, CONCAT(first_name, ' ', last_name) AS title, created_at FROM family_member WHERE registered_by = ?
        UNION
        SELECT 'meeting' AS type, title, created_at FROM meeting WHERE created_by = ?
        ORDER BY created_at DESC LIMIT 5`;

    db.query(profileQuery, [memberId], (err, profileRes) => {
        db.query(notificationsQuery, [memberId, memberId], (err2, notifications) => {
            db.query(meetingsQuery, [familyId], (err3, meetings) => {
                res.render('meeting_list', {
                    profile: profileRes[0] || { first_name: 'User' },
                    notifications,
                    totalNotifications: notifications.length,
                    meetings, // Tuma list ya mikutano hapa
                    success: req.session.success,
                    error: req.session.error
                });
                req.session.success = null;
                req.session.error = null;
            });
        });
    });
});

// --- API: Update Meeting ---
app.put('/update-meeting/:id', (req, res) => {
    const { title, meeting_date, meeting_time, location } = req.body;
    const sql = `UPDATE meeting SET title = ?, meeting_date = ?, meeting_time = ?, location = ? WHERE meeting_id = ?`;
    db.query(sql, [title, meeting_date, meeting_time, location, req.params.id], (err) => {
        if (err) return res.json({ success: false });
        req.session.success = "Meeting updated successfully!";
        res.json({ success: true });
    });
});

// --- API: Delete Meeting ---
app.delete('/delete-meeting/:id', (req, res) => {
    db.query("DELETE FROM meeting WHERE meeting_id = ?", [req.params.id], (err) => {
        if (err) return res.json({ success: false });
        req.session.success = "Meeting cancelled and deleted.";
        res.json({ success: true });
    });
});

// attend meeting
app.get('/attend_meeting', (req, res) => {
    const memberId = req.session.member_id;
    if (!memberId) return res.redirect('/index');

    const profileQuery = `SELECT first_name, last_name, role FROM family_member WHERE member_id = ? LIMIT 1`;
    const notificationsQuery = `
        SELECT 'member' AS type, CONCAT(first_name, ' ', last_name) AS title, created_at FROM family_member WHERE registered_by = ?
        UNION
        SELECT 'meeting' AS type, title, created_at FROM meeting WHERE created_by = ?
        ORDER BY created_at DESC LIMIT 5`;

    db.query(profileQuery, [memberId], (err, profileRes) => {
        db.query(notificationsQuery, [memberId, memberId], (err2, notifications) => {
            res.render('attend_meeting', {
                profile: profileRes[0] || { first_name: 'User' },
                notifications,
                totalNotifications: notifications.length
            });
        });
    });
});

// reminder
// --- GET: Reminder Page ---
app.get('/reminder', (req, res) => {
  const familyId = req.session.family_id;
  const memberId = req.session.member_id;

  // ✅ Check session
  if (!familyId || !memberId) return res.redirect('/index');

  // 🔹 Profile
  const profileQuery = `
    SELECT first_name, last_name, role
    FROM family_member
    WHERE member_id = ?
    LIMIT 1
  `;

  // 🔹 Notifications (same as other pages ✅)
  const notificationsQuery = `
    SELECT 'member' AS type, CONCAT(first_name, ' ', last_name) AS title, created_at
    FROM family_member
    WHERE registered_by = ?
    UNION
    SELECT 'meeting' AS type, title, created_at
    FROM meeting
    WHERE created_by = ?
    ORDER BY created_at DESC
    LIMIT 5
  `;

  // 🔹 Meetings (for dropdown)
  const meetingsQuery = `
    SELECT meeting_id, title, meeting_date, meeting_time, location
    FROM meeting
    WHERE family_id = ?
    ORDER BY meeting_date DESC
  `;

  // 🔥 Flash messages (optional but recommended)
  const success = req.session.success;
  const error = req.session.error;

  req.session.success = null;
  req.session.error = null;

  // 🚀 RUN QUERIES
  db.query(profileQuery, [memberId], (err, profileResult) => {
    if (err) throw err;

    const profile = profileResult[0] || {
      first_name: 'User',
      last_name: '',
      role: ''
    };

    db.query(notificationsQuery, [memberId, memberId], (err2, notifications) => {
      if (err2) notifications = [];

      const totalNotifications = notifications.length;

      db.query(meetingsQuery, [familyId], (err3, meetings) => {
        if (err3) meetings = [];

        // ✅ SEND TO EJS
        res.render('reminder', {
          profile,
          notifications,
          totalNotifications,
          meetings,
          success,
          error
        });
      });
    });
  });
});

// --- 2. POST: Process & Send Reminder ---
app.post('/send-reminder', async (req, res) => {
    const { meeting_id, method, custom_message } = req.body;
    const familyId = req.session.family_id;
    const apiToken = '2|ZDVZgBsVfuBbhCRnFf5N9jmYsG7JLPtoXACoqLQO88f41331';

    // 1. Pata taarifa za mkutano
    db.query("SELECT * FROM meeting WHERE meeting_id = ?", [meeting_id], (err, meetingResult) => {
        if (err || meetingResult.length === 0) return res.redirect('/reminder');
        
        const meeting = meetingResult[0];
        const finalMessage = custom_message || `UKUMBUSHO: Kikao cha ${meeting.title} kitafanyika tarehe ${meeting.meeting_date.toISOString().split('T')[0]} saa ${meeting.meeting_time}. Mahali: ${meeting.location}. Tafadhali hudhuria.`;

        // 2. Pata namba za simu za wanafamilia wote
        db.query("SELECT phone, first_name FROM family_member WHERE family_id = ?", [familyId], async (err2, members) => {
            if (err2) return res.redirect('/reminder');

            // Ikiwa SMS imechaguliwa
            if (Array.isArray(method) ? method.includes('sms') : method === 'sms') {
                for (let member of members) {
                    const smsData = {
                        "from": "FamilyHub",
                        "recipient": member.phone,
                        "message": `Habari ${member.first_name}, ${finalMessage}`,
                        "channel": "1010105"
                    };

                    try {
                        await axios.post('https://tegasms.teganas.co.tz/api/v1/send_sms/type/single', smsData, {
                            headers: { 'Authorization': `Bearer ${apiToken}`, 'Content-Type': 'application/json' }
                        });
                        console.log(`SMS Sent to ${member.phone}`);
                    } catch (e) {
                        console.error(`SMS Failed for ${member.phone}:`, e.message);
                    }
                }
            }

            // Ikiwa In-App imechaguliwa (Hapa unaweza ku-insert kwenye table ya notifications)
            if (Array.isArray(method) ? method.includes('app') : method === 'app') {
                // Mfano wa ku-insert kwenye database kwa ajili ya kuonekana kwenye "Notifications"
                const notifSql = "INSERT INTO notifications (member_id, title, message, type) VALUES ?";
                const values = members.map(m => [m.member_id, 'Meeting Reminder', finalMessage, 'meeting']);
                // db.query(notifSql, [values], (err) => { ... });
            }

            req.session.success = "Reminders are being processed and sent!";
            res.redirect('/reminder');
        });
    });
});

app.get('/events', (req, res) => {
    const memberId = req.session.member_id;
    const familyId = req.session.family_id;
    const filterType = req.query.type;

    if (!memberId || !familyId) return res.redirect('/index');

    // 1️⃣ Fetch profile
    const profileQuery = `SELECT first_name, last_name, role FROM family_member WHERE member_id = ? LIMIT 1`;

    // 2️⃣ Fetch notifications from meetings
    const notificationsQuery = `
        SELECT 'meeting' AS type, title, created_at
        FROM meeting
        WHERE family_id = ?
        ORDER BY created_at DESC
        LIMIT 5
    `;

    // 3️⃣ Fetch events
    let eventSql = `
        SELECT e.*, m.first_name AS creator_name
        FROM family_event e
        LEFT JOIN family_member m ON e.created_by = m.member_id
        WHERE e.family_id = ?
    `;
    let queryParams = [familyId];
    if (filterType === 'emergency') {
        eventSql += ` AND e.event_type = 'msiba'`;
    }
    eventSql += ` ORDER BY e.event_date ASC`;

    // 4️⃣ Badge counts
    const badgeQuery = `
        SELECT
            (SELECT COUNT(*) FROM family_event WHERE family_id = ? AND event_date >= CURDATE()) AS activeEventsCount,
            (SELECT COUNT(*) FROM family_event WHERE family_id = ? AND has_contribution = 1) AS pendingPayments
    `;

    // Execute queries
    db.query(profileQuery, [memberId], (err, profileResult) => {
        if (err) return res.status(500).send("Database Error (Profile)");

        db.query(notificationsQuery, [familyId], (err2, notifications) => {
            if (err2) console.error("Notifications Query Error:", err2);

            db.query(badgeQuery, [familyId, familyId], (err3, badgeData) => {
                if (err3) console.error("Badge Query Error:", err3);

                db.query(eventSql, queryParams, (err4, events) => {
                    if (err4) return res.status(500).send("Events Query Error");

                    const badges = badgeData[0] || { activeEventsCount: 0, pendingPayments: 0 };

                    res.render('events', {
                        profile: profileResult[0] || { first_name: 'Member', role: 'member' },
                        notifications: notifications || [],          // ✅ Notifications from meetings
                        totalNotifications: (notifications || []).length,
                        events: events || [],
                        activeEventsCount: badges.activeEventsCount,
                        pendingPayments: badges.pendingPayments,
                        filterType: filterType || 'all'
                    });
                });
            });
        });
    });
});

app.get('/events', (req, res) => {
    const memberId = req.session.member_id;
    const familyId = req.session.family_id;
    const filterType = req.query.type;

    if (!memberId || !familyId) return res.redirect('/index');

    // 1️⃣ Fetch profile
    const profileQuery = `SELECT first_name, last_name, role FROM family_member WHERE member_id = ? LIMIT 1`;

    // 2️⃣ Fetch notifications from meetings
    const notificationsQuery = `
        SELECT 'meeting' AS type, title, created_at
        FROM meeting
        WHERE family_id = ?
        ORDER BY created_at DESC
        LIMIT 5
    `;

    // 3️⃣ Fetch events
    let eventSql = `
        SELECT e.*, m.first_name AS creator_name
        FROM family_event e
        LEFT JOIN family_member m ON e.created_by = m.member_id
        WHERE e.family_id = ?
    `;
    let queryParams = [familyId];
    if (filterType === 'emergency') {
        eventSql += ` AND e.event_type = 'msiba'`;
    }
    eventSql += ` ORDER BY e.event_date ASC`;

    // 4️⃣ Badge counts
    const badgeQuery = `
        SELECT
            (SELECT COUNT(*) FROM family_event WHERE family_id = ? AND event_date >= CURDATE()) AS activeEventsCount,
            (SELECT COUNT(*) FROM family_event WHERE family_id = ? AND has_contribution = 1) AS pendingPayments
    `;

    // Execute queries
    db.query(profileQuery, [memberId], (err, profileResult) => {
        if (err) return res.status(500).send("Database Error (Profile)");

        db.query(notificationsQuery, [familyId], (err2, notifications) => {
            if (err2) console.error("Notifications Query Error:", err2);

            db.query(badgeQuery, [familyId, familyId], (err3, badgeData) => {
                if (err3) console.error("Badge Query Error:", err3);

                db.query(eventSql, queryParams, (err4, events) => {
                    if (err4) return res.status(500).send("Events Query Error");

                    const badges = badgeData[0] || { activeEventsCount: 0, pendingPayments: 0 };

                    res.render('events', {
                        profile: profileResult[0] || { first_name: 'Member', role: 'member' },
                        notifications: notifications || [],          // ✅ Notifications from meetings
                        totalNotifications: (notifications || []).length,
                        events: events || [],
                        activeEventsCount: badges.activeEventsCount,
                        pendingPayments: badges.pendingPayments,
                        filterType: filterType || 'all'
                    });
                });
            });
        });
    });
});


app.get('/create_event', (req, res) => {
    const memberId = req.session.member_id;
    const familyId = req.session.family_id;

    if (!memberId || !familyId) return res.redirect('/index');

    // 1️⃣ Profile
    const profileQuery = `SELECT first_name, last_name, role FROM family_member WHERE member_id = ? LIMIT 1`;

    // 2️⃣ Notifications from meeting table
    const notificationsQuery = `
        SELECT 'meeting' AS type, title, created_at
        FROM meeting
        WHERE family_id = ?
        ORDER BY created_at DESC
        LIMIT 5
    `;

    // 3️⃣ Badge counts
    const badgeQuery = `
        SELECT
            (SELECT COUNT(*) FROM family_event WHERE family_id = ? AND event_date >= CURDATE()) AS activeEventsCount,
            (SELECT COUNT(*) FROM family_event WHERE family_id = ? AND has_contribution = 1) AS pendingPayments
    `;

    // Execute queries
    db.query(profileQuery, [memberId], (err, profileResult) => {
        if (err) return res.status(500).send("Database Error (Profile)");

        db.query(notificationsQuery, [familyId], (err2, notifications) => {
            if (err2) console.error("Notifications Query Error:", err2);

            db.query(badgeQuery, [familyId, familyId], (err3, badgeData) => {
                if (err3) console.error("Badge Query Error:", err3);

                const badges = badgeData[0] || { activeEventsCount: 0, pendingPayments: 0 };

                res.render('create_event', {
                    profile: profileResult[0] || { first_name: 'Member', role: 'member' },
                    notifications: notifications || [],
                    totalNotifications: (notifications || []).length,
                    activeEventsCount: badges.activeEventsCount,
                    pendingPayments: badges.pendingPayments
                });
            });
        });
    });
});

app.get('/lists', (req, res) => {
  const familyId = req.session.family_id;
  const memberId = req.session.member_id;

  if (!familyId || !memberId) return res.redirect('/index');

  // --- 1. Profile of logged-in user ---
  const profileQuery = `SELECT first_name, last_name, role FROM family_member WHERE member_id = ? LIMIT 1`;

  // --- 2. Recent notifications (e.g., meetings/events) ---
  const notificationsQuery = `
    SELECT 'meeting' AS type, title, created_at 
    FROM meeting 
    WHERE family_id = ? 
    ORDER BY created_at DESC 
    LIMIT 5
  `;

  // --- 3. Contributors (aggregated payments) ---
  const contributorsQuery = `
    SELECT 
      m.member_id,
      m.first_name,
      m.last_name,
      e.event_id,
      e.title AS event_title,
      e.event_type,
      e.target_amount,
      SUM(CASE WHEN p.status = 'paid' THEN p.amount ELSE 0 END) AS total_paid,
      SUM(CASE WHEN p.status = 'pledge' THEN p.amount ELSE 0 END) AS total_pledge,
      MAX(p.payment_date) AS last_payment_date,
      GROUP_CONCAT(CASE WHEN p.status = 'pledge' THEN p.note END SEPARATOR ', ') AS pledge_notes
    FROM payment p
    JOIN family_member m ON p.recorded_by = m.member_id
    JOIN family_event e ON p.event_id = e.event_id
    WHERE p.family_id = ?
    GROUP BY m.member_id, e.event_id
    ORDER BY last_payment_date DESC
  `;

  db.query(profileQuery, [memberId], (err, profileRows) => {
    if (err) return res.status(500).send("Error fetching profile");

    const profile = profileRows[0] || { first_name: 'User', role: 'member' };

    db.query(notificationsQuery, [familyId], (err2, notifications) => {
      if (err2) notifications = [];

      db.query(contributorsQuery, [familyId], (err3, contributors) => {
        if (err3) contributors = [];

        // Compute contributor status and remaining amount
        const updatedContributors = contributors.map(c => {
          let status = '';
          if (c.total_paid >= c.target_amount) status = 'paid';
          else if (c.total_paid > 0 && (c.total_paid + c.total_pledge) >= c.target_amount) status = 'partial';
          else status = 'pledge';

          return {
            ...c,
            status,
            remaining_amount: c.target_amount - c.total_paid
          };
        });

        res.render('lists', {
          profile,
          notifications: notifications || [],
          totalNotifications: notifications ? notifications.length : 0,
          contributors: updatedContributors || []
        });
      });
    });
  });
});


app.post('/send_reminder_sms', (req, res) => {
  const { memberId, eventId } = req.body;

  if (!memberId || !eventId) return res.status(400).json({ message: 'Missing member or event ID' });

  // Get member info and event info
  const sql = `
    SELECT m.phone, m.first_name, e.title AS event_title, e.target_amount,
           SUM(CASE WHEN p.status='paid' THEN p.amount ELSE 0 END) AS total_paid
    FROM family_member m
    JOIN payment p ON p.recorded_by = m.member_id AND p.event_id = ?
    JOIN family_event e ON e.event_id = p.event_id
    WHERE m.member_id = ?
    GROUP BY m.member_id, e.event_id
  `;

  db.query(sql, [eventId, memberId], (err, rows) => {
    if (err || rows.length === 0) {
      console.error('Error fetching member/event data:', err);
      return res.status(500).json({ message: 'Error fetching data' });
    }

    const member = rows[0];
    const remaining = member.target_amount - (member.total_paid || 0);

    const smsMessage = `Habari ${member.first_name}, bado umeacha kutoa mchango wa ${remaining} TZS kwa tukio: ${member.event_title}. Tafadhali malizia ahadi yako.`;

    // --- Send SMS via TegaSMS ---
    const smsData = {
      from: "FamilyHub",
      recipient: member.phone,
      message: smsMessage,
      channel: "1010105"
    };

    axios.post('https://tegasms.teganas.co.tz/api/v1/send_sms/type/single', smsData, {
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      }
    })
    .then(response => {
      console.log(`SMS sent to ${member.phone}:`, response.data);
      res.json({ message: 'SMS reminder sent successfully!' });
    })
    .catch(error => {
      console.error(`SMS Error for ${member.phone}:`, error.response ? error.response.data : error.message);
      res.status(500).json({ message: 'Failed to send SMS reminder.' });
    });
  });
});

// B. POST: Hifadhi Event Mpya na Tuma SMS kupitia TegaSMS kama ni ya Dharura (Msiba)
app.post('/save_event', (req, res) => {
    const { title, description, event_type, event_date, event_time, location, has_contribution, target_amount } = req.body;
    const familyId = req.session.family_id;
    const memberId = req.session.member_id;

    if (!familyId || !memberId) return res.redirect('/index');

    const sql = `INSERT INTO family_event (family_id, title, description, event_type, event_date, event_time, location, has_contribution, target_amount, created_by) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    db.query(sql, [
        familyId, 
        title, 
        description, 
        event_type, 
        event_date, 
        event_time || null, 
        location, 
        has_contribution || 0, 
        target_amount || 0, 
        memberId
    ], (err, result) => {
        if (err) {
            console.error("Save Event Error:", err);
            return res.status(500).send("Database error occurred.");
        }

        // --- SMART LOGIC: TegaSMS Integration ---
        // Ikiwa ni MSIBA, tuma taarifa kwa wanafamilia wote
        if (event_type === 'msiba') {
            const getFamilyPhones = `SELECT phone, first_name FROM family_member WHERE family_id = ?`;
            
            db.query(getFamilyPhones, [familyId], (err2, members) => {
                if (!err2 && members.length > 0) {
                    const apiToken = '2|ZDVZgBsVfuBbhCRnFf5N9jmYsG7JLPtoXACoqLQO88f41331';
                    
                    // Tunatuma SMS kwa kila mwanafamilia
                    members.forEach(member => {
                        const smsMessage = `TAARIFA YA MSIBA:
Habari ${member.first_name}, tuna dharura kwenye familia. 

Tukio: ${title}
Sehemu: ${location}
Tarehe: ${event_date}
Muda: ${event_time || 'Haukupangwa'}

Tafadhali ingia kwenye mfumo kwa maelezo zaidi na kutoa mchango wako.
Umoja ni Nguvu.`;

                        const smsData = {
                            "from": "FamilyHub", 
                            "recipient": member.phone, // Namba iliyopo kwenye DB (mfano: 255...)
                            "message": smsMessage,
                            "channel": "1010105"
                        };

                        // Tuma SMS kupitia Axios
                        axios.post('https://tegasms.teganas.co.tz/api/v1/send_sms/type/single', smsData, {
                            headers: {
                                'Authorization': `Bearer ${apiToken}`,
                                'Content-Type': 'application/json'
                            }
                        }).then(response => {
                            console.log(`SMS sent to ${member.phone}:`, response.data);
                        }).catch(e => {
                            console.error(`SMS Error for ${member.phone}:`, e.response ? e.response.data : e.message);
                        });
                    });
                }
            });
        }

        req.session.success = "Event posted successfully and alerts sent!";
        res.redirect('/events');
    });
});

app.get('/event_contributions', (req, res) => {
    const memberId = req.session.member_id;
    const familyId = req.session.family_id;
    if (!memberId || !familyId) return res.redirect('/index');

    const profileQuery = `SELECT first_name, last_name, role FROM family_member WHERE member_id = ? LIMIT 1`;
    const notificationsQuery = `SELECT 'meeting' AS type, title, created_at FROM meeting WHERE family_id = ? ORDER BY created_at DESC LIMIT 5`;

    // Current Events: contribution still open (3 days after event_date)
    const currentEventQuery = `
        SELECT e.*, 
        (SELECT SUM(amount) FROM payment WHERE event_id = e.event_id AND status = 'paid') as collected_amount,
        (SELECT amount FROM payment WHERE event_id = e.event_id AND recorded_by = ? AND status = 'paid' LIMIT 1) as my_paid_amount,
        (SELECT amount FROM payment WHERE event_id = e.event_id AND recorded_by = ? AND status = 'pledge' LIMIT 1) as my_pledge_amount
        FROM family_event e
        WHERE e.family_id = ? AND e.has_contribution = 1
          AND CURDATE() <= DATE_ADD(e.event_date, INTERVAL 3 DAY)
        ORDER BY e.event_date DESC
    `;

    // Previous Events: contribution closed
    const previousEventQuery = `
        SELECT e.*, 
        (SELECT SUM(amount) FROM payment WHERE event_id = e.event_id AND status = 'paid') as collected_amount,
        (SELECT amount FROM payment WHERE event_id = e.event_id AND recorded_by = ? AND status = 'paid' LIMIT 1) as my_paid_amount,
        (SELECT amount FROM payment WHERE event_id = e.event_id AND recorded_by = ? AND status = 'pledge' LIMIT 1) as my_pledge_amount
        FROM family_event e
        WHERE e.family_id = ? AND e.has_contribution = 1
          AND CURDATE() > DATE_ADD(e.event_date, INTERVAL 3 DAY)
        ORDER BY e.event_date DESC
    `;

    db.query(profileQuery, [memberId], (err, profile) => {
        if (err) return res.status(500).send("Database Error (Profile)");

        db.query(notificationsQuery, [familyId], (err2, notifications) => {
            if (err2) console.error("Notification Error:", err2);

            db.query(currentEventQuery, [memberId, memberId, familyId], (errCurrent, currentEvents) => {
                if (errCurrent) console.error("Current Event Error:", errCurrent);

                db.query(previousEventQuery, [memberId, memberId, familyId], (errPrev, previousEvents) => {
                    if (errPrev) console.error("Previous Event Error:", errPrev);

                    res.render('event_contributions', {
                        profile: profile[0] || { first_name: 'User', role: 'member' },
                        notifications: notifications || [],
                        totalNotifications: notifications ? notifications.length : 0,
                        currentEvents: currentEvents || [],
                        previousEvents: previousEvents || [],
                        memberId
                    });
                });
            });
        });
    });
});

// POST: Hifadhi Muamala au Ahadi
app.post('/submit_contribution', (req, res) => {
    const { event_id, amount, reference_number, status, pledge_date } = req.body;
    const familyId = req.session.family_id;
    const memberId = req.session.member_id;

    const sql = `INSERT INTO payment (family_id, recorded_by, event_id, amount, reference_number, status, payment_type, note, payment_date) 
                 VALUES (?, ?, ?, ?, ?, ?, 'event', ?, CURDATE())`;

    const note = status === 'pledge' ? `Ahadi ya kulipa tarehe ${pledge_date}` : 'Mchango wa tukio';

    db.query(sql, [familyId, memberId, event_id, amount, reference_number || null, status, note], (err, result) => {
        if (err) {
            console.error(err);
            req.session.error = "Imeshindikana kuhifadhi taarifa.";
        } else {
            req.session.success = status === 'paid' ? "Muamala umehifadhiwa! Admin atahakiki." : "Ahadi yako imerekodiwa. Ahsante!";
        }
        res.redirect('/event_contributions');
    });
});

app.get('/package', (req, res) => {
    const familyId = req.session.family_id;
    const memberId = req.session.member_id;

    if (!familyId || !memberId) return res.redirect('/index');

    // 1. Query ya Profile ya mtumiaji aliyelogin
    const profileQuery = `SELECT first_name, last_name, role FROM family_member WHERE member_id = ? LIMIT 1`;

    // 2. Query ya Notifications (Arifa za mikutano/events hivi karibuni)
    const notificationsQuery = `SELECT 'meeting' AS type, title, created_at FROM meeting WHERE family_id = ? ORDER BY created_at DESC LIMIT 5`;

    // 3. Query ya taarifa za familia na kifurushi chao
    const familyQuery = `
        SELECT f.*, p.name as current_package_name 
        FROM family f 
        LEFT JOIN packages p ON f.package_id = p.id 
        WHERE f.family_id = ?`;

    // 4. Query ya vifurushi vinavyouzwa (Vingine mbali na Trial)
    const allPackagesQuery = `SELECT * FROM packages WHERE name != 'Trial'`;

    // 5. Query ya Smart Sidebar (Matukio yanayokuja)
    const badgeQuery = `SELECT COUNT(*) as activeEventsCount FROM family_event WHERE family_id = ? AND event_date >= CURDATE()`;

    db.query(profileQuery, [memberId], (err, profile) => {
        db.query(notificationsQuery, [familyId], (err2, notifications) => {
            db.query(familyQuery, [familyId], (err3, familyData) => {
                db.query(allPackagesQuery, (err4, availablePackages) => {
                    db.query(badgeQuery, [familyId], (err5, badgeData) => {

                        const family = familyData[0] || {};
                        const badges = badgeData[0] || { activeEventsCount: 0 };
                        
                        // Logic ya Trial ya saa 24
                        let isTrialExpired = false;
                        if (family.package_status === 'trial' && family.expiry_date) {
                            const now = new Date();
                            const expiry = new Date(family.expiry_date);
                            if (now > expiry) isTrialExpired = true;
                        }

                        res.render('package', {
                            profile: profile[0] || { first_name: 'User' },
                            notifications: notifications || [],
                            totalNotifications: notifications ? notifications.length : 0,
                            family: family,
                            packages: availablePackages || [],
                            isTrialExpired,
                            activeEventsCount: badges.activeEventsCount,
                            pendingPayments: 0 // Unaweza kuongeza query hapa pia kama ukipenda
                        });
                    });
                });
            });
        });
    });
});

// Route ya kutuma Ombi la Malipo (Reference Number)
app.post('/subscribe', (req, res) => {
    const { package_id, ref_number } = req.body;
    const familyId = req.session.family_id;

    // Badilisha status kuwa 'pending' hadi admin akubali
    const sql = `UPDATE family SET package_status = 'pending', package_id = ? WHERE family_id = ?`;
    
    // Unaweza pia kusave ref_number kwenye table mpya ya 'subscriptions' kwa rekodi zaidi
    db.query(sql, [package_id, familyId], (err) => {
        if (err) return res.status(500).send("Error");
        req.session.success = "Malipo yako yamepokelewa! Admin atahakiki Reference Number: " + ref_number;
        res.redirect('/package');
    });
});

app.get('/payment_history', (req, res) => {
    const memberId = req.session.member_id;
    const familyId = req.session.family_id;

    if (!memberId || !familyId) return res.redirect('/index');

    // 1. Profile & Notifications
    const profileQuery = `SELECT first_name, last_name, role FROM family_member WHERE member_id = ? LIMIT 1`;
    const notificationsQuery = `SELECT 'meeting' AS type, title, created_at FROM meeting WHERE family_id = ? ORDER BY created_at DESC LIMIT 5`;

    // 2. Historia ya Malipo ya Package
    // Tunajiunga (JOIN) na table ya packages ili kupata jina la plan
    const historyQuery = `
        SELECT p.*, pk.name as package_name, m.first_name, m.last_name 
        FROM payment p
        LEFT JOIN packages pk ON p.package_id = pk.id
        LEFT JOIN family_member m ON p.recorded_by = m.member_id
        WHERE p.family_id = ? AND p.payment_type = 'package'
        ORDER BY p.payment_date DESC`;

    // 3. Sidebar Badge (Smart Logic)
    const badgeQuery = `SELECT COUNT(*) as activeEventsCount FROM family_event WHERE family_id = ? AND event_date >= CURDATE()`;

    db.query(profileQuery, [memberId], (err, profile) => {
        db.query(notificationsQuery, [familyId], (err2, notifications) => {
            db.query(historyQuery, [familyId], (err3, history) => {
                db.query(badgeQuery, [familyId], (err4, badgeData) => {
                    
                    const badges = badgeData ? badgeData[0] : { activeEventsCount: 0 };

                    res.render('payment_history', {
                        profile: profile[0] || { first_name: 'User' },
                        notifications: notifications || [],
                        totalNotifications: notifications ? notifications.length : 0,
                        history: history || [], // Hii ndio itajaza table yako
                        activeEventsCount: badges.activeEventsCount,
                        pendingPayments: 0,
                        memberId
                    });
                });
            });
        });
    });
});

// family report
app.get('/family_report', (req, res) => {
    const memberId = req.session.member_id;
    const familyId = req.session.family_id;

    if (!memberId || !familyId) return res.redirect('/index');

    const profileQuery = `SELECT first_name, last_name, role FROM family_member WHERE member_id = ? LIMIT 1`;
    const notificationsQuery = `SELECT 'meeting' AS type, title, created_at FROM meeting WHERE family_id = ? ORDER BY created_at DESC LIMIT 5`;

    // 1. Stats Query (Tumetumia 'payment' badala ya 'payments')
    const statsQuery = `
        SELECT 
            (SELECT COUNT(*) FROM family_member WHERE family_id = ?) as total_members,
            (SELECT SUM(amount) FROM payment WHERE family_id = ?) as total_payments,
            (SELECT COUNT(*) FROM meeting WHERE family_id = ?) as total_meetings`;

    // 2. Table Query (Tumetumia 'payment' na column sahihi 'recorded_by' kama ndiye aliyelipa)
    // AU kama 'recorded_by' ni admin, hakikisha una column ya 'member_id' kwenye table ya payment.
    // Hapa nimebadilisha 'payments' kuwa 'payment'.
    const tableQuery = `
        SELECT 
            m.member_id, m.first_name, m.last_name, m.role,
            (SELECT COUNT(*) FROM drive_file WHERE uploaded_by = m.member_id) as files_count,
            (SELECT SUM(amount) FROM payment WHERE recorded_by = m.member_id) as member_paid
        FROM family_member m
        WHERE m.family_id = ?`;

    db.query(profileQuery, [memberId], (err, profile) => {
        if (err) return res.status(500).send("Database Error");

        db.query(notificationsQuery, [familyId], (err2, notifications) => {
            db.query(statsQuery, [familyId, familyId, familyId], (err3, stats) => {
                if (err3) console.error("Stats Error:", err3);
                
                const finalStats = (stats && stats.length > 0) ? stats[0] : { total_members: 0, total_payments: 0, total_meetings: 0 };

                db.query(tableQuery, [familyId], (err4, tableData) => {
                    if (err4) console.error("Table Error:", err4);

                    res.render('family_report', {
                        profile: profile[0] || { first_name: 'User' },
                        notifications: notifications || [],
                        totalNotifications: notifications ? notifications.length : 0,
                        stats: finalStats,
                        tableData: tableData || [],
                        memberId
                    });
                });
            });
        });
    });
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

// --- GET: Select Future Head of Family ---
// --- GET: Select Future Head of Family ---
app.get('/select_future', (req, res) => {
  const familyId = req.session.family_id;
  const memberId = req.session.member_id;

  if (!familyId || !memberId) return res.redirect('/index');

  // 🔹 Profile of logged-in user
  const profileQuery = `
    SELECT first_name, last_name, role
    FROM family_member
    WHERE member_id = ?
    LIMIT 1
  `;

  // 🔹 Notifications = latest 5 activities (member registrations + meetings)
  const notificationsQuery = `
    SELECT 'member' AS type, CONCAT(first_name, ' ', last_name) AS title, created_at
    FROM family_member
    WHERE registered_by = ?
    UNION
    SELECT 'meeting' AS type, title, created_at
    FROM meeting
    WHERE created_by = ?
    ORDER BY created_at DESC
    LIMIT 5
  `;

  // 🔹 Eligible members registered by this user (18+ years) and NOT future head
  const eligibleMembersQuery = `
    SELECT member_id, first_name, middle_name, last_name, gender, date_of_birth, relationship, branch_type
    FROM family_member
    WHERE family_id = ? 
      AND registered_by = ?
      AND TIMESTAMPDIFF(YEAR, date_of_birth, CURDATE()) >= 18
      AND is_future_head = 0
    ORDER BY created_at DESC
  `;

  db.query(profileQuery, [memberId], (err, profileResult) => {
    if (err) throw err;
    const profile = profileResult[0] || { first_name: 'User', last_name: '', role: '' };

    db.query(notificationsQuery, [memberId, memberId], (err2, notifications) => {
      if (err2) notifications = [];

      const totalNotifications = notifications.length; // count for badge

      db.query(eligibleMembersQuery, [familyId, memberId], (err3, members) => {
        if (err3) members = [];

        // Render EJS template with all data
        res.render('select_future', {
          profile,
          notifications,
          totalNotifications,
          members,
          success: req.query.success || null,
          error: req.query.error || null
        });
      });
    });
  });
});

// --- POST: Confirm Future Head ---
app.post('/confirm_future_head', (req, res) => {
  const familyId = req.session.family_id;
  const memberId = req.body.member_id; // selected member

  if (!familyId || !memberId) {
    return res.json({ success: false, message: 'Invalid request.' });
  }

  // Remove previous future head
  const resetQuery = `UPDATE family_member SET is_future_head = 0 WHERE family_id = ?`;
  db.query(resetQuery, [familyId], (err) => {
    if (err) return res.json({ success: false, message: 'Database error.' });

    // Set new future head
    const updateQuery = `UPDATE family_member SET is_future_head = 1 WHERE member_id = ?`;
    db.query(updateQuery, [memberId], (err2) => {
      if (err2) return res.json({ success: false, message: 'Database error.' });

      return res.json({ success: true, message: 'Member has been successfully selected as Future Head.' });
    });
  });
});

// 1. Route ya Chat List (Iliyorekebishwa)
app.get('/chat_list', (req, res) => {
    const memberId = req.session.member_id;
    const familyId = req.session.family_id;

    if (!memberId || !familyId) return res.redirect('/index');

    const profileQuery = `SELECT first_name, last_name, role FROM family_member WHERE member_id = ? LIMIT 1`;
    const notificationsQuery = `SELECT 'meeting' AS type, title, created_at FROM meeting WHERE family_id = ? ORDER BY created_at DESC LIMIT 5`;

    // Vuta wanafamilia wote wa familia hii (isipokuwa aliyelogin)
    const familyMembersQuery = `
        SELECT m.member_id, m.first_name, m.last_name, m.role,
        (SELECT message FROM chat_message WHERE (sender_id = m.member_id OR sender_id = ?) ORDER BY sent_at DESC LIMIT 1) as last_msg,
        (SELECT sent_at FROM chat_message WHERE (sender_id = m.member_id OR sender_id = ?) ORDER BY sent_at DESC LIMIT 1) as last_time
        FROM family_member m
        WHERE m.family_id = ? AND m.member_id != ?
        ORDER BY last_time DESC`;

    db.query(profileQuery, [memberId], (err, profileRes) => {
        db.query(notificationsQuery, [familyId], (err2, notifications) => {
            db.query(familyMembersQuery, [memberId, memberId, familyId, memberId], (err3, familyMembers) => {
                res.render('chat_list', {
                    profile: profileRes[0] || { first_name: 'User' },
                    notifications: notifications || [],
                    totalNotifications: notifications.length,
                    familyMembers: familyMembers || []
                });
            });
        });
    });
});


app.get('/family_chat', (req, res) => {
    const { member_id: memberId, family_id: familyId } = req.session;

    if (!memberId || !familyId) return res.redirect('/index');

    const profileQuery = `
        SELECT first_name, last_name, role 
        FROM family_member 
        WHERE member_id = ? LIMIT 1`;

    const familySql = `
        SELECT family_name 
        FROM family 
        WHERE family_id = ? LIMIT 1`;

    const messagesSql = `
        SELECT cm.*, fm.first_name, fm.last_name, fm.role as sender_role
        FROM chat_message cm
        JOIN family_member fm ON cm.sender_id = fm.member_id
        WHERE fm.family_id = ? AND cm.receiver_id IS NULL
        ORDER BY cm.sent_at ASC`;

    const membersSql = `
        SELECT member_id, first_name, last_name, role, relationship 
        FROM family_member 
        WHERE family_id = ?`;

    // 🔔 Notifications kama chat_list
    const notificationsQuery = `
        SELECT 'meeting' AS type, title, created_at 
        FROM meeting 
        WHERE family_id = ? 
        ORDER BY created_at DESC LIMIT 5`;

    db.query(profileQuery, [memberId], (err, profileRes) => {
        if (err) return res.status(500).send("Profile Error");

        db.query(familySql, [familyId], (err2, familyRes) => {
            if (err2) return res.status(500).send("Family Error");

            db.query(messagesSql, [familyId], (err3, messages) => {
                if (err3) return res.status(500).send("Messages Error");

                db.query(membersSql, [familyId], (err4, allMembers) => {
                    if (err4) return res.status(500).send("Members Error");

                    db.query(notificationsQuery, [familyId], (err5, notifications) => {
                        if (err5) return res.status(500).send("Notifications Error");

                        const renderData = {
                            family: {
                                family_name: familyRes[0]?.family_name || 'Family Group',
                                total_members: allMembers.length
                            },

                            // ✅ FIX PROFILE
                            profile: profileRes[0] || {
                                first_name: 'User',
                                last_name: '',
                                role: 'Member'
                            },

                            messages: messages || [],
                            allMembers: allMembers || [],
                            memberId: memberId,

                            // ✅ FIX NOTIFICATIONS
                            notifications: notifications || [],
                            totalNotifications: notifications.length
                        };

                        res.render('family_chat', renderData);
                    });
                });
            });
        });
    });
});

// Route ya kupost meseji
app.post('/send_group_message', (req, res) => {
    const senderId = req.session.member_id;
    const { message } = req.body;
    if (!senderId || !message) return res.redirect('back');

    const sql = "INSERT INTO chat_message (sender_id, receiver_id, message) VALUES (?, NULL, ?)";
    db.query(sql, [senderId, message], (err) => {
        res.redirect('/family_chat'); // Inarudi hapa hapa kuonyesha meseji mpya
    });
});

// direct chat
app.get('/direct_messages', (req, res) => {
  res.render('direct_messages'); // HOF
});


const fs = require('fs');

// 1. GET Drive Files & Folders
app.get('/drive_files', (req, res) => {
    const { member_id: memberId, family_id: familyId } = req.session;
    if (!memberId || !familyId) return res.redirect('/index');

    const profileQuery = `SELECT first_name, last_name, role FROM family_member WHERE member_id = ? LIMIT 1`;
    const notificationsQuery = `SELECT 'meeting' AS type, title, created_at FROM meeting WHERE family_id = ? ORDER BY created_at DESC LIMIT 5`;
    const foldersQuery = `SELECT * FROM family_drive WHERE family_id = ? ORDER BY created_at DESC`;
    const filesQuery = `SELECT df.*, fm.first_name as uploader 
                        FROM drive_file df 
                        JOIN family_member fm ON df.uploaded_by = fm.member_id 
                        WHERE fm.family_id = ? ORDER BY uploaded_at DESC`;

    db.query(profileQuery, [memberId], (err, profile) => {
        if (err) console.error(err);
        db.query(notificationsQuery, [familyId], (err2, notifications) => {
            if (err2) console.error(err2);
            db.query(foldersQuery, [familyId], (err3, folders) => {
                if (err3) console.error(err3);
                db.query(filesQuery, [familyId], (err4, files) => {
                    if (err4) console.error(err4);
                    // Pass success/error messages if set in session
                    const success = req.session.success || null;
                    const error = req.session.error || null;
                    // Clear messages
                    req.session.success = null;
                    req.session.error = null;

                    res.render('drive_files', {
                        profile: profile[0],
                        notifications,
                        totalNotifications: notifications.length,
                        folders: folders || [],
                        files: files || [],
                        memberId,
                        success,
                        error
                    });
                });
            });
        });
    });
});

// 2. UPLOAD FILES (multiple)
app.post('/upload_file', upload.array('familyFile', 10), (req, res) => {
  const { member_id } = req.session;
  const { folder_id } = req.body; // optional

  if (!req.files || req.files.length === 0) {
    req.session.error = "Hakuna faili lililochaguliwa.";
    return res.redirect('/drive_files');
  }

  const values = req.files.map(file => [
    null,          // drive_id auto
    member_id,
    file.originalname,
    '/uploads/drives/' + file.filename,
    file.mimetype,
    folder_id || null
  ]);

  const sql = `INSERT INTO drive_file (drive_id, uploaded_by, file_name, file_path, file_type, folder_id) VALUES ?`;

  db.query(sql, [values], (err) => {
    if (err) {
      console.error(err);
      req.session.error = "Imeshindwa kuhifadhi taarifa.";
      return res.redirect('/drive_files');
    }
    req.session.success = "Files uploaded successfully!";
    res.redirect('/drive_files');
  });
});

// 3. CREATE FOLDER
app.post('/create_folder', (req, res) => {
    const { family_id } = req.session;
    const { folder_name } = req.body;

    if (!folder_name || folder_name.trim() === "") {
        req.session.error = "Tafadhali weka jina la folder.";
        return res.redirect('/drive_files');
    }

    const sql = `INSERT INTO family_drive (family_id, folder_name) VALUES (?, ?)`;
    db.query(sql, [family_id, folder_name], (err) => {
        if (err) {
            console.error("Folder Error:", err);
            req.session.error = "Folder haikuweza kuundwa.";
        } else {
            req.session.success = `Folder "${folder_name}" imeundwa.`;
        }
        res.redirect('/drive_files');
    });
});

// 4. DELETE FILE
app.delete('/delete_file/:id', (req, res) => {
    const fileId = req.params.id;
    db.query('SELECT file_path FROM drive_file WHERE file_id = ?', [fileId], (err, result) => {
        if (err) return res.sendStatus(500);

        if (result.length > 0) {
            const fullPath = path.join(__dirname, '../public', result[0].file_path);
            if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);

            db.query('DELETE FROM drive_file WHERE file_id = ?', [fileId], (err2) => {
                if (err2) return res.sendStatus(500);
                req.session.success = "File deleted successfully!";
                res.sendStatus(200);
            });
        } else {
            req.session.error = "File haikupatikana!";
            res.sendStatus(404);
        }
    });
});

// 5. DELETE FOLDER (OPTIONAL)
app.delete('/delete_folder/:id', (req, res) => {
    const folderId = req.params.id;
    db.query('DELETE FROM family_drive WHERE drive_id = ?', [folderId], (err) => {
        if (err) {
            req.session.error = "Folder haikuweza kufutwa.";
            return res.sendStatus(500);
        }
        req.session.success = "Folder deleted successfully!";
        res.sendStatus(200);
    });
});

app.get('/drive_files/folder/:id', (req, res) => {
  const folderId = req.params.id;
  const { member_id: memberId, family_id: familyId } = req.session;

  if (!memberId || !familyId) return res.redirect('/index');

  const profileQuery = `SELECT first_name, last_name, role FROM family_member WHERE member_id = ? LIMIT 1`;
  const notificationsQuery = `SELECT 'meeting' AS type, title, created_at FROM meeting WHERE family_id = ? ORDER BY created_at DESC LIMIT 5`;
  const folderQuery = `SELECT * FROM family_drive WHERE drive_id = ? LIMIT 1`;
  const filesQuery = `SELECT df.*, fm.first_name AS uploader
                      FROM drive_file df
                      JOIN family_member fm ON df.uploaded_by = fm.member_id
                      WHERE df.folder_id = ? ORDER BY uploaded_at DESC`;

  db.query(profileQuery, [memberId], (err, profile) => {
    db.query(notificationsQuery, [familyId], (err2, notifications) => {
      db.query(folderQuery, [folderId], (err3, folder) => {
        if (!folder || folder.length === 0) return res.redirect('/drive_files');

        db.query(filesQuery, [folderId], (err4, files) => {
          const success = req.session.success || null;
          const error = req.session.error || null;
          req.session.success = null;
          req.session.error = null;

          res.render('drive_files', {
            profile: profile[0],
            notifications,
            totalNotifications: notifications.length,
            folders: [],           // hide folders inside folder view
            files: files || [],
            memberId,
            success,
            error,
            currentFolder: folder[0] // pass folder info to template
          });
        });
      });
    });
  });
});

// GET folder files as JSON (for modal)
app.get('/api/folder/:id', (req, res) => {
  const folderId = req.params.id;
  const { family_id: familyId } = req.session;

  if (!familyId) return res.status(401).json({ error: "Unauthorized" });

  const sql = `
    SELECT df.*, fm.first_name AS uploader
    FROM drive_file df
    JOIN family_member fm ON df.uploaded_by = fm.member_id
    WHERE df.folder_id = ? AND fm.family_id = ?
    ORDER BY df.uploaded_at DESC
  `;

  db.query(sql, [folderId, familyId], (err, files) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "Server error" });
    }

    // send files as JSON
    res.json({ files });
  });
});

app.get('/profile', (req, res) => {
    const memberId = req.session.member_id;
    const familyId = req.session.family_id;

    if (!memberId || !familyId) return res.redirect('/index');

    // 1. Query ya Profile, Notifications na Sidebar Badges
    const profileQuery = `SELECT * FROM family_member WHERE member_id = ? LIMIT 1`;
    const notificationsQuery = `SELECT 'meeting' AS type, title, created_at FROM meeting WHERE family_id = ? ORDER BY created_at DESC LIMIT 5`;
    const badgeQuery = `
        SELECT 
            (SELECT COUNT(*) FROM family_event WHERE family_id = ? AND event_date >= CURDATE()) as activeEventsCount,
            (SELECT COUNT(*) FROM family_event WHERE family_id = ? AND has_contribution = 1 AND event_id NOT IN (
                SELECT event_id FROM payment WHERE recorded_by = ? AND status = 'paid'
            )) as pendingPaymentsCount`;

    db.query(profileQuery, [memberId], (err, profileData) => {
        if (err || profileData.length === 0) return res.redirect('/dashboard');

        const user = profileData[0];

        db.query(notificationsQuery, [familyId], (err2, notifications) => {
            db.query(badgeQuery, [familyId, familyId, memberId], (err3, badgeData) => {
                
                const badges = badgeData ? badgeData[0] : { activeEventsCount: 0, pendingPaymentsCount: 0 };
                const status = req.query.status;
                const message = req.query.message;

                res.render('profile', {
                    profile: user,
                    adminName: user.first_name + " " + user.last_name,
                    adminPhone: user.phone || 'N/A',
                    adminEmail: user.email || 'N/A',
                    adminRole: user.role,
                    notifications: notifications || [],
                    totalNotifications: notifications ? notifications.length : 0,
                    activeEventsCount: badges.activeEventsCount,
                    pendingPayments: badges.pendingPaymentsCount,
                    systemTitle: "Family Genealogy System",
                    success: status === 'success' ? message : null,
                    error: status === 'error' ? message : null
                });
            });
        });
    });
});

// --- 1. UPDATE PROFILE IMAGE ---
app.post('/update-profile-image', upload.single('profileImage'), (req, res) => {
    const memberId = req.session.member_id;
    if (!req.file) return res.redirect('/profile?status=error&message=Tafadhali chagua picha');

    // Njia inayohifadhiwa kwenye database (Inaendana na static folder la public)
    const dbImagePath = '/uploads/drives/' + req.file.filename;

    const sql = "UPDATE family_member SET profile_image = ? WHERE member_id = ?";
    db.query(sql, [dbImagePath, memberId], (err) => {
        if (err) {
            console.error(err);
            return res.redirect('/profile?status=error&message=Imeshindikana kusasisha picha');
        }
        res.redirect('/profile?status=success&message=Picha imebadilishwa kikamilifu');
    });
});

app.post('/update-profile', (req, res) => {
    // 1. Debugging: Angalia nini kinakuja kutoka kwenye Form
    console.log("Form Data:", req.body);
    console.log("Session Data:", req.session);

    const { firstName, lastName, email, phone, gender } = req.body;
    
    // 2. Chagua jina sahihi la session unalotumia kwenye mfumo wako
    const memberId = req.session.member_id; 

    if (!memberId) {
        console.log("KOSA: Session haikuonekana, ninarudisha Index...");
        return res.redirect('/index');
    }

    // 3. Hakikisha SQL inalingana na majina ya Column kwenye DB
    const sql = "UPDATE family_member SET first_name = ?, last_name = ?, email = ?, phone = ?, gender = ? WHERE member_id = ?";
    
    db.query(sql, [firstName, lastName, email, phone, gender, memberId], (err, result) => {
        if (err) {
            console.error("Database Error Wakati wa Update:", err);
            // Ikishindwa kwenye DB, rudi kwenye profile uonyeshe error
            return res.redirect('/profile?status=error&message=Hitilafu kwenye database');
        }
        
        console.log("Update Imefanikiwa kwa ID:", memberId);
        res.redirect('/profile?status=success&message=Taarifa zimesasishwa kikamilifu');
    });
});
// --- 3. UPDATE PASSWORD ---
app.post('/update-password', async (req, res) => {
    const { currentPassword, newPassword, confirmNewPassword } = req.body;
    const memberId = req.session.member_id;

    if (newPassword !== confirmNewPassword) {
        return res.redirect('/profile?status=error&message=Password mpya hazilingani');
    }

    db.query("SELECT password FROM family_member WHERE member_id = ?", [memberId], async (err, results) => {
        if (err || results.length === 0) return res.redirect('/profile?status=error&message=Mtumiaji hajapatikana');

        const isMatch = await bcrypt.compare(currentPassword, results[0].password);
        if (!isMatch) return res.redirect('/profile?status=error&message=Password ya sasa siyo sahihi');

        const hashed = await bcrypt.hash(newPassword, 10);
        db.query("UPDATE family_member SET password = ? WHERE member_id = ?", [hashed, memberId], (err) => {
            res.redirect('/profile?status=success&message=Password imebadilishwa');
        });
    });
});


app.get('/title', (req, res) => {
    const memberId = req.session.member_id;
    if (!memberId) return res.redirect('/index');

    const sql = "SELECT * FROM family_member WHERE member_id = ?";
    db.query(sql, [memberId], (err, results) => {
        const user = results[0];
        res.render('title', { 
            profile: user, // Hii itaruhusu title.ejs kuona picha
            adminName: user.first_name + " " + user.last_name,
            // ... data zingine
        });
    });
});

module.exports = app;
