require('dotenv').config();
const app = require('./src/app');
require('./src/config/db'); // MySQL connection

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
