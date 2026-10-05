const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

require('dotenv').config();
const https = require('https');
const cron = require('node-cron');
const { Telegraf } = require('telegraf');
const axios = require('axios');
const { getAllRegisteredUsers } = require('./db');
const { escapeMarkdown } = require('./formatting');

const botToken = process.env.TELEGRAM_BOT_TOKEN;
if (!botToken) {
    console.error('[cron-service] FATAL: TELEGRAM_BOT_TOKEN is not defined in environment.');
    process.exit(1);
}

const bot = new Telegraf(botToken, {
    telegram: {
        agent: new https.Agent({ family: 4 })
    }
});

const BOT_INTERNAL_URL = 'http://bot:3030/internal/generate-report'; // Resolves inside docker-compose network
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

if (!INTERNAL_API_KEY) {
    console.error('[cron-service] FATAL: INTERNAL_API_KEY is not defined in environment.');
    process.exit(1);
}

/**
 * Execute reminder job for a set of sections.
 * @param {string} jobName 
 * @param {Array} sections 
 * @param {string} greeting 
 */
async function sendReminders(jobName, sections, greeting) {
    console.log(`[cron-service] Starting ${jobName} task reminder job...`);
    
    let users = [];
    try {
        users = await getAllRegisteredUsers();
    } catch (err) {
        console.error(`[cron-service] Failed to query registered users from database:`, err.message);
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
            
            const name = user.display_name ? ` ${escapeMarkdown(user.display_name)}` : '';
            const caption = `${greeting}${name}! នេះជាកិច្ចការរបស់អ្នកសម្រាប់ថ្ងៃនេះ៖`;

            const response = await axios.post(BOT_INTERNAL_URL, {
                jiraAccountId: user.jira_account_id,
                sections: sections
            }, {
                headers: {
                    'X-Internal-Key': INTERNAL_API_KEY
                },
                responseType: 'arraybuffer'
            });

            const pdfBuffer = Buffer.from(response.data);
            const dateStr = new Date().toISOString().slice(0, 10);
            const reportNameStr = jobName.replace(' ', '_');
            const filename = `Jira_Tasks_${reportNameStr}_${dateStr}.pdf`;

            await bot.telegram.sendDocument(user.chat_id, {
                source: pdfBuffer,
                filename: filename
            }, {
                caption: caption,
                parse_mode: 'Markdown'
            });

            console.log(`[cron-service] Sent ${jobName} reminder to ${user.display_name || user.jira_email}.`);
            sentCount++;

            // Optional: Pause a little so we don't spam Telegram/Jira too fast
            await new Promise(resolve => setTimeout(resolve, 500));

        } catch (err) {
            failedCount++;
            console.error(`[cron-service] Error sending ${jobName} reminder to user ${user.telegram_user_id} (${user.jira_email}):`, err.response ? err.response.data.toString() : err.message);
        }
    }

    console.log(`[cron-service] ${jobName} reminder job finished. Summary: Total: ${users.length}, Sent: ${sentCount}, Skipped: ${skippedCount}, Failed: ${failedCount}`);
}

async function sendDailyReminders() {
    const sections = [
        { status: 'To Do' },
        { status: 'In Progress' }
    ];
    await sendReminders('Morning', sections, '🌅 អរុណសួស្តី');
}

async function sendEveningReminders() {
    const today = new Date().toISOString().slice(0, 10);
    const sections = [
        { status: 'To Do' },
        { status: 'In Progress' },
        { 
            status: 'Done', 
            dateFilter: { field: 'resolutiondate', from: today, to: today } 
        }
    ];
    await sendReminders('Evening', sections, '🌇 សាយ័ណ្ហសួស្តី');
}

const CRON_SCHEDULE = process.env.CRON_SCHEDULE || '0 8 * * 1-5';
const EVENING_CRON_SCHEDULE = process.env.EVENING_CRON_SCHEDULE || '0 17 * * 1-5';
const TIMEZONE = process.env.CRON_TIMEZONE || 'Asia/Phnom_Penh';

console.log(`[cron-service] Initializing morning cron job with schedule: "${CRON_SCHEDULE}" in timezone "${TIMEZONE}".`);
cron.schedule(CRON_SCHEDULE, () => {
    sendDailyReminders().catch(err => {
        console.error('[cron-service] Unhandled error during scheduled morning reminder execution:', err);
    });
}, {
    scheduled: true,
    timezone: TIMEZONE
});

console.log(`[cron-service] Initializing evening cron job with schedule: "${EVENING_CRON_SCHEDULE}" in timezone "${TIMEZONE}".`);
cron.schedule(EVENING_CRON_SCHEDULE, () => {
    sendEveningReminders().catch(err => {
        console.error('[cron-service] Unhandled error during scheduled evening reminder execution:', err);
    });
}, {
    scheduled: true,
    timezone: TIMEZONE
});

console.log('[cron-service] Service is running and waiting for scheduled cron triggers.');

module.exports = {
    sendDailyReminders,
    sendEveningReminders
};
