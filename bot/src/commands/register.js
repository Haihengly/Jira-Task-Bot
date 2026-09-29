const { Markup } = require('telegraf');
const { saveMapping, getMappingByTelegramId } = require('../db/mappings');
const { REGISTERED_COMMANDS, getRegisteredKeyboard } = require('../utils/commands');
const { createOAuthState } = require('../auth/state');

// In-memory store for pending confirmations: telegramUserId -> { status, chatId, accountId, email, displayName, existingMapping }
const pendingRegistrations = new Map();

function getOAuthUrl(telegramUserId, chatId) {
    const state = createOAuthState(telegramUserId, chatId);
    return `https://jirabot.kaizenops.site/auth/jira?state=${state}`;
}

/**
 * Handle /register command (OAuth-only).
 * Any arguments passed are rejected.
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
 * Any arguments passed are rejected.
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

    const oauthUrl = getOAuthUrl(telegramUserId, chatId);
    return ctx.reply(
        'សូមចុចប៊ូតុងខាងក្រោមដើម្បីប្តូរ និងភ្ជាប់គណនី Jira របស់អ្នកដោយសុវត្ថិភាពតាមរយៈ Atlassian OAuth 2.0៖',
        Markup.inlineKeyboard([
            Markup.button.url('🔗 ភ្ជាប់គណនី Jira', oauthUrl)
        ])
    );
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
    }

    return ctx.editMessageText('ការចុះឈ្មោះត្រូវបានលុបចោល។ សូមប្រើ /register ម្តងទៀត។').catch(() => {});
}

module.exports = {
    handleRegister,
    handleChangeAccount,
    handleConfirmRegister,
    handleCancelRegister,
    setPendingRegistration
};
