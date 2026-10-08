const { Markup } = require('telegraf');
const { saveMapping, getMappingByTelegramId } = require('../db/mappings');
const { REGISTERED_COMMANDS, getRegisteredKeyboard } = require('../utils/commands');
const { createOAuthState } = require('../auth/state');

// In-memory store for pending confirmations: telegramUserId -> { status, chatId, accountId, email, displayName, existingMapping }
const pendingRegistrations = new Map();

function getOAuthUrl(telegramUserId, chatId, source = 'link') {
    const state = createOAuthState(telegramUserId, chatId, source);
    return `https://jirabot.kaizenops.site/auth/jira?state=${state}`;
}

/**
 * Shared Step 1: Pre-link warning instructions and "ready" callback button.
 */
async function sendLinkPrecheck(ctx, source = 'link') {
    const telegramUserId = ctx.from?.id ? ctx.from.id.toString() : null;

    if (!telegramUserId) {
        return ctx.reply('Unable to read your Telegram information.');
    }

    try {
        const existingMapping = await getMappingByTelegramId(telegramUserId);
        if (source === 'link' && existingMapping) {
            return ctx.reply('អ្នកបានភ្ជាប់គណនីរួចហើយ។ សូមប្រើ /changeaccount ដើម្បីប្តូរគណនី Jira របស់អ្នក។');
        }
        if (source === 'changeaccount' && !existingMapping) {
            return ctx.reply('អ្នកមិនទាន់បានភ្ជាប់គណនីទេ។ សូមប្រើ /link ជាមុនសិន។');
        }
    } catch (err) {
        console.error(`Error checking existing mapping in precheck (${source}):`, err);
    }

    const precheckMsg =
        `🔗 មុនពេលភ្ជាប់គណនី សូមត្រៀមខ្លួន៖\n\n` +
        `1️⃣ បើអ្នកមានគណនី Atlassian ច្រើន ឬមិនប្រាកដថាកំពុងប្រើគណនីមួយណា សូមចេញពីគណនី Atlassian (Log out) ជាមុនសិន\n` +
        `2️⃣ ចូលគណនី Atlassian ដែលអ្នកប្រើជាមួយ Jira ឡើងវិញ\n` +
        `3️⃣ ចុច "✅ ខ្ញុំត្រៀមរួចហើយ" ខាងក្រោម`;

    return ctx.reply(
        precheckMsg,
        Markup.inlineKeyboard([
            [Markup.button.url('🔍 បើកទំព័រគណនី Atlassian', 'https://id.atlassian.com')],
            [Markup.button.callback('✅ ខ្ញុំត្រៀមរួចហើយ', `link_ready:${source}`)]
        ])
    );
}

/**
 * Handle /link command (OAuth-only).
 */
async function handleLink(ctx) {
    if (ctx.payload && ctx.payload.trim().length > 0) {
        return ctx.reply('⚠️ សូមប្រើ /link ដោយគ្មានអក្សរផ្សេងទៀតនៅពីក្រោយ។');
    }
    return sendLinkPrecheck(ctx, 'link');
}

/**
 * Handle /changeaccount command (OAuth-only).
 */
async function handleChangeAccount(ctx) {
    if (ctx.payload && ctx.payload.trim().length > 0) {
        return ctx.reply('⚠️ សូមប្រើ /changeaccount ដោយគ្មានអក្សរផ្សេងទៀតនៅពីក្រោយ។');
    }
    return sendLinkPrecheck(ctx, 'changeaccount');
}

/**
 * Handle callback for "✅ ខ្ញុំត្រៀមរួចហើយ" (Step 2: Generate OAuth token & show login button).
 */
async function handleLinkReadyCb(ctx) {
    await ctx.answerCbQuery().catch(() => {});

    const callbackData = ctx.callbackQuery?.data || '';
    const source = callbackData.startsWith('link_ready:') ? callbackData.split(':')[1] : 'link';

    const telegramUserId = ctx.from?.id ? ctx.from.id.toString() : null;
    const chatId = ctx.chat?.id ? ctx.chat.id.toString() : null;

    if (!telegramUserId || !chatId) {
        return ctx.editMessageText('Unable to read your Telegram /chat information.').catch(() => {});
    }

    // Point-of-use verification to reject cleanly if state changed (e.g. already linked or not linked)
    try {
        const existingMapping = await getMappingByTelegramId(telegramUserId);
        if (source === 'link' && existingMapping) {
            return ctx.editMessageText('⚠️ អ្នកបានភ្ជាប់គណនីរួចហើយ។ មិនអាចភ្ជាប់ម្តងទៀតទេ។ សូមប្រើ /changeaccount ដើម្បីប្តូរគណនី។').catch(() => {});
        }
        if (source === 'changeaccount' && !existingMapping) {
            return ctx.editMessageText('⚠️ អ្នកមិនទាន់បានភ្ជាប់គណនីទេ។ មិនអាចប្តូរគណនីបានទេ។ សូមប្រើ /link ជាមុនសិន។').catch(() => {});
        }
    } catch (err) {
        console.error('Error verifying mapping in link_ready callback:', err);
    }

    // Create OAuth state token ONLY at step 2 (10 min validity starts now)
    const oauthUrl = getOAuthUrl(telegramUserId, chatId, source);
    const actionText = source === 'changeaccount' ? 'ប្តូរគណនី Jira របស់អ្នក' : 'ភ្ជាប់គណនី Jira របស់អ្នក';
    const messageText =
        `🔗 សូមចុចប៊ូតុងខាងក្រោម ដើម្បី${actionText}៖\n\n` +
        `⏳ តំណភ្ជាប់នេះមានសុពលភាព 10 នាទី\n\n` +
        `⚠️ សូមប្រាកដថាអ្នកបានចូលគណនី Atlassian ដែលត្រឹមត្រូវរួចរាល់ មុននឹងចុច។\n\n` +
        `សូមអរគុណ`;

    return ctx.editMessageText(
        messageText,
        Markup.inlineKeyboard([
            Markup.button.url('🔐 ចូលជាមួយ Atlassian', oauthUrl)
        ])
    ).catch(err => {
        console.error('Failed to edit message in handleLinkReadyCb:', err.message);
    });
}

function setPendingRegistration(telegramUserId, params) {
    pendingRegistrations.set(telegramUserId, params);
}

async function handleConfirmRegister(ctx) {
    await ctx.answerCbQuery().catch(() => {});

    const telegramUserId = ctx.from?.id ? ctx.from.id.toString() : null;
    if (!telegramUserId || !pendingRegistrations.has(telegramUserId)) {
        return ctx.editMessageText('មិនមានការភ្ជាប់គណនីដែលកំពុងរង់ចាំនោះទេ។ សូមប្រើ /link ម្តងទៀត។').catch(() => {});
    }

    const pending = pendingRegistrations.get(telegramUserId);
    pendingRegistrations.delete(telegramUserId);

    try {
        await saveMapping(telegramUserId, pending.chatId, pending.accountId, pending.email, pending.displayName);

        try {
            await ctx.telegram.setMyCommands(REGISTERED_COMMANDS, { scope: { type: 'chat', chat_id: pending.chatId } });
        } catch (menuErr) {
            console.error('Failed to update user command menu:', menuErr.message);
        }

        let replyMessage = `ភ្ជាប់គណនីជោគជ័យ! 🎉\n`;

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

    return ctx.editMessageText('ការភ្ជាប់គណនីត្រូវបានលុបចោល។ សូមប្រើ /link ម្តងទៀត។').catch(() => {});
}

module.exports = {
    handleLink,
    handleChangeAccount,
    handleLinkReadyCb,
    handleConfirmRegister,
    handleCancelRegister,
    setPendingRegistration
};
