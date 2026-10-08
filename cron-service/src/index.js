const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

require('dotenv').config();
const https = require('https');
const cron = require('node-cron');
const { Telegraf } = require('telegraf');
const axios = require('axios');
const { getAllRegisteredUsers } = require('./db');
const { escapeMarkdown, getCambodiaDateYMD } = require('./formatting');

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

const BOT_INTERNAL_URL = process.env.BOT_INTERNAL_URL || 'http://bot:3030/internal/generate-report';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;

if (!INTERNAL_API_KEY) {
    console.error('[cron-service] FATAL: INTERNAL_API_KEY is not defined in environment.');
    process.exit(1);
}

/**
 * Execute reminder job for a set of sections.
 * @param {string} jobName 'Morning' or 'Evening'
 * @param {Array} sections
 * @param {string|null} [targetUserId=null]
 */
async function sendReminders(jobName, sections, targetUserId = null) {
    console.log(`[cron-service] Starting ${jobName} task reminder job...`);

    let users = [];
    try {
        users = await getAllRegisteredUsers();
    } catch (err) {
        console.error(`[cron-service] Failed to query registered users from database:`, err.message);
        return;
    }

    if (targetUserId) {
        users = users.filter(u => String(u.telegram_user_id) === String(targetUserId));
        console.log(`[cron-service] Filtered users for target user ID ${targetUserId}: ${users.length} match(es).`);
    } else {
        console.log(`[cron-service] Found ${users.length} registered user(s).`);
    }

    let sentCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    const failedUserIds = [];
    const skippedUserIds = [];

    const ymd = getCambodiaDateYMD();
    const isMorning = jobName === 'Morning';

    for (const user of users) {
        try {
            if (!user.jira_account_id || !user.chat_id) {
                skippedCount++;
                if (user && user.telegram_user_id) {
                    skippedUserIds.push(user.telegram_user_id);
                }
                continue;
            }

            const name = user.display_name ? ` ${escapeMarkdown(user.display_name)}` : '';

            const response = await axios.post(BOT_INTERNAL_URL, {
                jiraAccountId: user.jira_account_id,
                sections: sections,
                reportType: jobName
            }, {
                headers: {
                    'X-Internal-Key': INTERNAL_API_KEY
                },
                timeout: 60000,
                responseType: 'arraybuffer'
            });

            const countHeader = response.headers['x-total-count'];
            const totalCount = countHeader !== undefined ? parseInt(countHeader, 10) : 0;

            if (totalCount === 0) {
                // Empty state (zero tasks): Send single text-only message, no PDF
                const emptyMessage = isMorning
                    ? `🌅 Good Morning${name}! ថ្ងៃនេះអ្នកមិនមានកិច្ចការត្រូវធ្វើ ឬកំពុងធ្វើឡើយ 🎉`
                    : `🌙 Good Evening${name}! ថ្ងៃនេះអ្នកមិនបានបញ្ចប់កិច្ចការណាមួយឡើយ។`;

                await bot.telegram.sendMessage(user.chat_id, emptyMessage);

                console.log(`[cron-service] Sent zero-tasks text reminder (${jobName}) to ${user.display_name || user.jira_email}.`);
                sentCount++;
                await new Promise(resolve => setTimeout(resolve, 500));
                continue;
            }

            // Tasks exist (> 0): Send TWO SEPARATE Telegram messages

            // Message 1: Greeting text
            const greetingText = isMorning
                ? `🌅 Good Morning${name}! នេះជាកិច្ចការរបស់អ្នកសម្រាប់ថ្ងៃនេះ៖`
                : `🌙 Good Evening${name}! នេះជាកិច្ចការរបស់អ្នកដែលបានធ្វើរួចថ្ងៃនេះ`;

            await bot.telegram.sendMessage(user.chat_id, greetingText);

            // Message 2: PDF Document with caption
            const pdfBuffer = Buffer.from(response.data);
            const dateStr = new Date().toISOString().slice(0, 10);
            const filename = `Jira_Tasks_${jobName}_${dateStr}.pdf`;
            const caption = isMorning
                ? `${ymd}_របាយការណ៍កិច្ចការត្រូវធ្វើនិងកំពុងធ្វើ`
                : `${ymd}_របាយការណ៍កិច្ចការដែលបានធ្វើរួចថ្ងៃនេះ`;

            await bot.telegram.sendDocument(user.chat_id, {
                source: pdfBuffer,
                filename: filename
            }, {
                caption: caption
            });

            console.log(`[cron-service] Sent ${jobName} PDF reminder to ${user.display_name || user.jira_email} (${totalCount} tasks).`);
            sentCount++;

            // Optional: Pause a little so we don't spam Telegram/Jira too fast
            await new Promise(resolve => setTimeout(resolve, 500));

        } catch (err) {
            failedCount++;
            if (user && user.telegram_user_id) {
                failedUserIds.push(user.telegram_user_id);
            }
            console.error(`[cron-service] Error sending ${jobName} reminder to user ${user.telegram_user_id} (${user.jira_email}):`, err.response ? err.response.data.toString() : err.message);
        }
    }

    console.log(`[cron-service] ${jobName} reminder job finished. Summary: Total: ${users.length}, Sent: ${sentCount}, Skipped: ${skippedCount}, Failed: ${failedCount}`);

    const adminChatId = process.env.ADMIN_CHAT_ID;
    if (adminChatId) {
        try {
            let alertMessage = '';

            if (failedCount > 0 || skippedCount > 0) {
                alertMessage = `⚠️ [Cron Alert] ${jobName} reminder job finished with issues.\n\n` +
                    `• Sent: ${sentCount}\n` +
                    `• Skipped: ${skippedCount}\n` +
                    `• Failed: ${failedCount}\n`;

                if (failedCount > 0) {
                    alertMessage += `• Failed Telegram User IDs: ${failedUserIds.join(', ') || 'N/A'}\n`;
                }

                if (skippedCount > 0) {
                    alertMessage += `• Skipped Telegram User IDs: ${skippedUserIds.join(', ') || 'N/A'}\n` +
                                    `Skipped users have incomplete records (missing jira_account_id or chat_id)`;
                }
            } else {
                alertMessage = `✅ [Cron Report] ${jobName} reminder job finished.\n\n` +
                    `• Sent: ${sentCount}\n` +
                    `• Skipped: ${skippedCount}\n` +
                    `• Failed: ${failedCount}`;
            }

            await bot.telegram.sendMessage(adminChatId, alertMessage.trim());
            console.log(`[cron-service] Sent tracking alert to ADMIN_CHAT_ID (${adminChatId}).`);
        } catch (alertErr) {
            console.error(`[cron-service] Failed to send tracking alert to ADMIN_CHAT_ID:`, alertErr.message);
        }
    }
}

async function sendDailyReminders(targetUserId = null) {
    const sections = [
        { status: 'To Do' },
        { status: 'In Progress' }
    ];
    await sendReminders('Morning', sections, targetUserId);
}

async function sendEveningReminders(targetUserId = null) {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE });
    const sections = [
        {
            status: 'Done',
            dateFilter: { field: 'resolutiondate', from: today, to: today }
        }
    ];
    await sendReminders('Evening', sections, targetUserId);
}

const MORNING_CRON_SCHEDULE = process.env.MORNING_CRON_SCHEDULE || '0 8 * * 1-5';
const EVENING_CRON_SCHEDULE = process.env.EVENING_CRON_SCHEDULE || '0 17 * * 1-5';
const TIMEZONE = process.env.CRON_TIMEZONE || 'Asia/Phnom_Penh';

// Parse command-line arguments for manual run
const args = process.argv.slice(2);
let runMode = null;
let targetUserId = null;

for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--run=')) {
        runMode = arg.substring(6);
    } else if (arg === '--run' && i + 1 < args.length) {
        runMode = args[++i];
    } else if (arg.startsWith('--user=')) {
        targetUserId = arg.substring(7);
    } else if (arg === '--user' && i + 1 < args.length) {
        targetUserId = args[++i];
    }
}

if (runMode) {
    if (runMode !== 'morning' && runMode !== 'evening') {
        console.error(`[cron-service] FATAL: Invalid --run option "${runMode}". Expected "morning" or "evening".`);
        process.exit(1);
    }

    (async () => {
        try {
            console.log(`[cron-service] Executing one-time manual run: mode="${runMode}"${targetUserId ? `, user="${targetUserId}"` : ''}`);
            if (runMode === 'morning') {
                await sendDailyReminders(targetUserId);
            } else if (runMode === 'evening') {
                await sendEveningReminders(targetUserId);
            }
            process.exit(0);
        } catch (err) {
            console.error(`[cron-service] Unhandled error during manual ${runMode} execution:`, err);
            process.exit(1);
        }
    })();
} else {
    console.log(`[cron-service] Initializing morning cron job with schedule: "${MORNING_CRON_SCHEDULE}" in timezone "${TIMEZONE}".`);
    cron.schedule(MORNING_CRON_SCHEDULE, () => {
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
}

module.exports = {
    sendDailyReminders,
    sendEveningReminders
};
