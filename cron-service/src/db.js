const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, '../../data/mappings.sqlite');

// Open database in READ-ONLY mode
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
    if (err) {
        console.error(`[cron-service] Error opening database in read-only mode at ${dbPath}:`, err.message);
    } else {
        console.log(`[cron-service] Connected to SQLite database (READ-ONLY) at ${dbPath}`);
    }
});

function getAllRegisteredUsers() {
    return new Promise((resolve, reject) => {
        const query = `SELECT telegram_user_id, chat_id, jira_account_id, jira_email, display_name FROM users WHERE jira_account_id IS NOT NULL`;
        db.all(query, [], (err, rows) => {
            if (err) return reject(err);
            resolve(rows || []);
        });
    });
}

module.exports = {
    db,
    getAllRegisteredUsers
};
