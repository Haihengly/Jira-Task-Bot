require('dotenv').config();
const cron = require('node-cron');
const { Telegraf } = require('telegraf');
const { getAllRegisteredUsers } = require('./db');
const jiraClient = require('./jiraClient');
const { formatCombinedTaskList, escapeMarkdown } = require('./formatting');

const botToken = process.env.TELEGRAM_BOT_TOKEN;
if (!botToken) {
    console.error('[cron-service] FATAL: TELEGRAM_BOT_TOKEN is not defined in environment.');
    process.exit(1);
}

const bot = new Telegraf(botToken);

/**
 * Execute the daily 8am reminder job.
 */
async function sendDailyReminders() {
    console.log('[cron-service] Starting 8:00 AM task reminder job...');
    const baseUrl = (process.env.JIRA_BASE_URL || '').replace(/\/+$/, '');

    let users = [];
    try {
        users = await getAllRegisteredUsers();
    } catch (err) {
        console.error('[cron-service] Failed to query registered users from database:', err.message);
        return;
    }

    console.log(`[cron-service] Found ${users.length} registered user(s).`);

    let sentCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const user of users) {
        try {
            if (!user.jira_account_id || !user.chat_id) {
                skippedCount++;
                continue;
            }

            const [todoIssues, inProgressIssues] = await Promise.all([
                jiraClient.getIssuesByAssigneeAndStatus(user.jira_account_id, 'To Do'),
                jiraClient.getIssuesByAssigneeAndStatus(user.jira_account_id, 'In Progress')
            ]);

            const totalIssues = (todoIssues?.length || 0) + (inProgressIssues?.length || 0);
            const name = user.display_name ? ` ${escapeMarkdown(user.display_name)}` : '';

            // Handle zero tasks across both categories
            if (totalIssues === 0) {
                const emptyMessage = `🌅 អរុណសួស្តី${name}! ថ្ងៃនេះគ្មានកិច្ចការទេ 👍`;
                await bot.telegram.sendMessage(user.chat_id, emptyMessage, {
                    parse_mode: 'Markdown',
                    disable_web_page_preview: true
                });
                console.log(`[cron-service] Sent zero-tasks reminder to ${user.display_name || user.jira_email}.`);
                sentCount++;
                continue;
            }

            let message = `🌅 *អរុណសួស្តី${name}! នេះជាកិច្ចការរបស់អ្នកសម្រាប់ថ្ងៃនេះ៖*\n\n`;
            message += formatCombinedTaskList(todoIssues, inProgressIssues, baseUrl);

            await bot.telegram.sendMessage(user.chat_id, message, {
                parse_mode: 'Markdown',
                disable_web_page_preview: true
            });

            console.log(`[cron-service] Sent daily reminder to ${user.display_name || user.jira_email} (${totalIssues} tasks).`);
            sentCount++;
        } catch (err) {
            failedCount++;
            console.error(`[cron-service] Error sending reminder to user ${user.telegram_user_id} (${user.jira_email}):`, err.message);
        }
    }

    console.log(`[cron-service] Reminder job finished. Summary: Total: ${users.length}, Sent: ${sentCount}, Skipped: ${skippedCount}, Failed: ${failedCount}`);
}

// Scheduled Monday to Friday at 8:00 AM Cambodia time (Asia/Phnom_Penh)
const CRON_SCHEDULE = process.env.CRON_SCHEDULE || '0 8 * * 1-5';
const TIMEZONE = process.env.CRON_TIMEZONE || 'Asia/Phnom_Penh';

console.log(`[cron-service] Initializing cron job with schedule: "${CRON_SCHEDULE}" in timezone "${TIMEZONE}".`);

cron.schedule(CRON_SCHEDULE, () => {
    sendDailyReminders().catch(err => {
        console.error('[cron-service] Unhandled error during scheduled reminder execution:', err);
    });
}, {
    scheduled: true,
    timezone: TIMEZONE
});

console.log('[cron-service] Service is running and waiting for scheduled cron trigger.');

module.exports = {
    sendDailyReminders
};
