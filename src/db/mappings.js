const db = require('./db');

function saveMapping(telegramUserId, chatId, jiraAccountId, jiraEmail) {
    return new Promise((resolve, reject) => {
        const query = `
            INSERT INTO users (telegram_user_id, chat_id, jira_account_id, jira_email)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(telegram_user_id) DO UPDATE SET
                chat_id = excluded.chat_id,
                jira_account_id = excluded.jira_account_id,
                jira_email = excluded.jira_email
        `;
        db.run(query, [telegramUserId, chatId, jiraAccountId, jiraEmail], function(err) {
            if (err) return reject(err);
            resolve(this.changes);
        });
    });
}

function getMappingByTelegramId(telegramUserId) {
    return new Promise((resolve, reject) => {
        const query = `SELECT * FROM users WHERE telegram_user_id = ?`;
        db.get(query, [telegramUserId], (err, row) => {
            if (err) return reject(err);
            resolve(row); // undefined if not found
        });
    });
}

module.exports = {
    saveMapping,
    getMappingByTelegramId
};
