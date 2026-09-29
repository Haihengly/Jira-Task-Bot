const { Markup } = require('telegraf');
const jiraClient = require('../jira/client');
const { saveMapping, getMappingByTelegramId, getMappingByJiraAccountId } = require('../db/mappings');
const { REGISTERED_COMMANDS, getRegisteredKeyboard } = require('../utils/commands');
const { createOAuthState } = require('../auth/state');

// In-memory store for pending confirmations: telegramUserId -> { status, chatId, accountId, email, displayName, existingMapping }
const pendingRegistrations = new Map();

// In-memory store for conversational email prompt (DORMANT/UNUSED in OAuth-only mode)
const awaitingEmails = new Map();

function getOAuthUrl(telegramUserId, chatId) {
    const state = createOAuthState(telegramUserId, chatId);
    return `https://jirabot.kaizenops.site/auth/jira?state=${state}`;
}

/**
 * Handle /register command (OAuth-only).
 * Any email arguments passed are ignored for security.
 */
async function handleRegister(ctx) {
    if (ctx.payload && ctx.payload.trim().length > 0) {
        return ctx.reply('ពាក្យបញ្ជានេះមិនត្រូវការអ្វីផ្សេងទៀតទេ។ សូមប្រើ /register ដោយគ្មានពាក្យផ្សេងទៀត។');
    }

    const telegramUserId = ctx.from?.id ? ctx.from.id.toString() : null;
    const chatId = ctx.chat?.id ? ctx.chat.id.toString() : null;

    if (!telegramUserId || !chatId) {
        return ctx.reply('Unable to read your Telegram /chat information.');
    }

    try {
        const existingMapping = await getMappingByTelegramId(telegramUserId);
        if (existingMapping) {
            return ctx.reply('អ្នកបានចុះឈ្មោះរួចហើយ។ សូមប្រើ /changeaccount ដើម្បីប្តូរគណនី Jira របស់អ្នក។');
        }
    } catch (err) {
        console.error('Error checking existing mapping in /register:', err);
    }

    // Reset any dormant awaiting state
    awaitingEmails.delete(telegramUserId);

    const oauthUrl = getOAuthUrl(telegramUserId, chatId);
    return ctx.reply(
        'សូមចុចប៊ូតុងខាងក្រោមដើម្បីភ្ជាប់គណនី Jira របស់អ្នកដោយសុវត្ថិភាពតាមរយៈ Atlassian OAuth 2.0៖',
        Markup.inlineKeyboard([
            Markup.button.url('🔗 ភ្ជាប់គណនី Jira', oauthUrl)
        ])
    );
}

/**
 * Handle /changeaccount command (OAuth-only).
 * Any email arguments passed are ignored for security.
 */
async function handleChangeAccount(ctx) {
    if (ctx.payload && ctx.payload.trim().length > 0) {
        return ctx.reply('ពាក្យបញ្ជានេះមិនត្រូវការអ្វីផ្សេងទៀតទេ។ សូមប្រើ /changeaccount ដោយគ្មានពាក្យផ្សេងទៀត។');
    }

    const telegramUserId = ctx.from?.id ? ctx.from.id.toString() : null;
    const chatId = ctx.chat?.id ? ctx.chat.id.toString() : null;

    if (!telegramUserId || !chatId) {
        return ctx.reply('Unable to read your Telegram /chat information.');
    }

    let existingMapping = null;
    try {
        existingMapping = await getMappingByTelegramId(telegramUserId);
    } catch (err) {
        console.error('Error checking existing mapping in /changeaccount:', err);
    }

    if (!existingMapping) {
        return ctx.reply('អ្នកមិនទាន់បានចុះឈ្មោះទេ។ សូមប្រើ /register ជាមុនសិន។');
    }

    // Reset any dormant awaiting state
    awaitingEmails.delete(telegramUserId);

    const oauthUrl = getOAuthUrl(telegramUserId, chatId);
    return ctx.reply(
        'សូមចុចប៊ូតុងខាងក្រោមដើម្បីប្តូរ និងភ្ជាប់គណនី Jira របស់អ្នកដោយសុវត្ថិភាពតាមរយៈ Atlassian OAuth 2.0៖',
        Markup.inlineKeyboard([
            Markup.button.url('🔗 ភ្ជាប់គណនី Jira', oauthUrl)
        ])
    );
}

function cancelAwaitingEmail(telegramUserId) {
    if (telegramUserId) {
        awaitingEmails.delete(telegramUserId);
    }
}

function isAwaitingEmail(telegramUserId) {
    return awaitingEmails.has(telegramUserId);
}

function setPendingRegistration(telegramUserId, params) {
    pendingRegistrations.set(telegramUserId, params);
}

async function handleConfirmRegister(ctx) {
    await ctx.answerCbQuery().catch(() => {});

    const telegramUserId = ctx.from?.id ? ctx.from.id.toString() : null;
    if (!telegramUserId || !pendingRegistrations.has(telegramUserId)) {
        return ctx.editMessageText('មិនមានការចុះឈ្មោះដែលកំពុងរង់ចាំនោះទេ។ សូមប្រើ /register ម្តងទៀត។').catch(() => {});
    }

    const pending = pendingRegistrations.get(telegramUserId);

    // Remove from pending and persist mapping
    pendingRegistrations.delete(telegramUserId);
    awaitingEmails.delete(telegramUserId);

    try {
        await saveMapping(telegramUserId, pending.chatId, pending.accountId, pending.email, pending.displayName);

        // Update scoped Telegram menu for this user to unlock registered commands
        try {
            await ctx.telegram.setMyCommands(REGISTERED_COMMANDS, { scope: { type: 'chat', chat_id: pending.chatId } });
        } catch (menuErr) {
            console.error('Failed to update user command menu:', menuErr.message);
        }

        let replyMessage = `ចុះឈ្មោះជោគជ័យ! 🎉\n`;

        if (pending.existingMapping && pending.existingMapping.jira_email && pending.existingMapping.jira_email.toLowerCase() !== pending.email.toLowerCase()) {
            replyMessage += `គណនី Jira របស់អ្នកត្រូវបានផ្លាស់ប្តូរពី ${pending.existingMapping.jira_email} ទៅ ${pending.email}។\n`;
        }

        replyMessage +=
            `គណនី Telegram ត្រូវបានភ្ជាប់ជាមួយគណនី Jira (${pending.displayName || pending.email})។\n\n` +
            `ឥឡូវនេះអ្នកអាចប្រើ:\n` +
            `/myaccount - មើលព័ត៌មានគណនីរបស់អ្នក\n` +
            `/mytasks - មើលកិច្ចការរបស់អ្នក\n` +
            `/changeaccount - ប្តូរគណនី Jira\n` +
            `/deleteaccount - ផ្ដាច់គណនី Jira\n` +
            `/help - មើលរបៀបប្រើប្រាស់ និងពាក្យបញ្ជាទាំងអស់`;

        await ctx.editMessageText('✅ បានភ្ជាប់គណនីជោគជ័យ!').catch(() => {});
        return ctx.reply(replyMessage, getRegisteredKeyboard());
    } catch (error) {
        console.error('Error saving mapping during confirm_register:', error);
        return ctx.editMessageText('An error occurred while linking your Jira account. Please try again later.').catch(() => {});
    }
}

async function handleCancelRegister(ctx) {
    await ctx.answerCbQuery().catch(() => {});

    const telegramUserId = ctx.from?.id ? ctx.from.id.toString() : null;
    if (telegramUserId) {
        pendingRegistrations.delete(telegramUserId);
        awaitingEmails.delete(telegramUserId);
    }

    return ctx.editMessageText('ការចុះឈ្មោះត្រូវបានលុបចោល។ សូមប្រើ /register ម្តងទៀត។').catch(() => {});
}

/*
================================================================================
  DISABLED - Email registration removed for security reasons.
  Email-only registration checks existence without password verification,
  enabling potential account impersonation. OAuth 2.0 is now mandatory.
================================================================================
*/

function isEmailRegistrationAllowed() {
    return process.env.ALLOW_EMAIL_REGISTRATION === 'true';
}

function isValidEmail(email) {
    if (!email || typeof email !== 'string') return false;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
}

async function processEmailSearch(ctx, email, telegramUserId, chatId) {
    try {
        const jiraUser = await jiraClient.findUserByEmail(email);

        if (!jiraUser || !jiraUser.accountId) {
            return ctx.reply(
                `រកមិនឃើញគណនី Jira ដែលមានអ៊ីមែល "${email}" ទេ។ ` +
                `សូមពិនិត្យអ៊ីមែលម្តងទៀត ឬសាកសួរអ្នកគ្រប់គ្រង Jira របស់អ្នក។`
            );
        }

        const existingJiraMapping = await getMappingByJiraAccountId(jiraUser.accountId);
        if (existingJiraMapping && existingJiraMapping.telegram_user_id !== telegramUserId) {
            return ctx.reply('គណនី Jira នេះត្រូវបានភ្ជាប់ដោយអ្នកប្រើប្រាស់ Telegram ផ្សេងរួចហើយ។');
        }

        const existingMapping = await getMappingByTelegramId(telegramUserId);
        const displayName = jiraUser.displayName || email;

        pendingRegistrations.set(telegramUserId, {
            status: 'PENDING_CONFIRM',
            chatId,
            accountId: jiraUser.accountId,
            email,
            displayName,
            existingMapping
        });

        awaitingEmails.delete(telegramUserId);

        return ctx.reply(
            `រកឃើញគណនី Jira: ${displayName} (${email})\n` +
            `តើនេះជាអ្នកមែនទេ? សូមជ្រើសរើសខាងក្រោម៖`,
            Markup.inlineKeyboard([
                Markup.button.callback('✅ បាទ/ចាស', 'confirm_register'),
                Markup.button.callback('❌ ទេ', 'cancel_register')
            ])
        );
    } catch (error) {
        console.error('Error during email search registration:', error);
        return ctx.reply('An error occurred while linking your Jira account. Please try again later.');
    }
}

async function handleConversationalEmail(ctx) {
    const telegramUserId = ctx.from?.id ? ctx.from.id.toString() : null;
    const chatId = ctx.chat?.id ? ctx.chat.id.toString() : null;
    const text = ctx.message?.text?.trim() || '';

    if (!telegramUserId || !chatId || text.startsWith('/')) {
        return;
    }

    if (!isEmailRegistrationAllowed()) {
        awaitingEmails.delete(telegramUserId);
        const oauthUrl = getOAuthUrl(telegramUserId, chatId);
        return ctx.reply(
            'ការចុះឈ្មោះតាមរយៈការបញ្ចូលអ៊ីមែលត្រូវបានបិទ។ សូមចុចប៊ូតុងខាងក្រោមដើម្បីភ្ជាប់គណនី Jira របស់អ្នកដោយសុវត្ថិភាពតាមរយៈ Atlassian OAuth 2.0៖',
            Markup.inlineKeyboard([
                Markup.button.url('🔗 ភ្ជាប់គណនី Jira', oauthUrl)
            ])
        );
    }

    if (!isValidEmail(text)) {
        return ctx.reply('ការបញ្ចូលមិនមែនជាទម្រង់អ៊ីមែលត្រឹមត្រូវទេ សូមព្យាយាមម្តងទៀត (ឧទាហរណ៍: name@example.com):');
    }

    return processEmailSearch(ctx, text, telegramUserId, chatId);
}

module.exports = {
    handleRegister,
    handleChangeAccount,
    handleConfirmRegister,
    handleCancelRegister,
    isAwaitingEmail,
    setPendingRegistration,
    cancelAwaitingEmail,
    handleConversationalEmail
};
