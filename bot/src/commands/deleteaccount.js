const { Markup } = require('telegraf');
const { getMappingByTelegramId, deleteMapping } = require('../db/mappings');
const { UNREGISTERED_COMMANDS, getUnregisteredKeyboard } = require('../utils/commands');

// In-memory store for pending unregistration confirmations: telegramUserId -> { chatId, email, displayName }
const pendingDeletions = new Map();

async function handleDeleteAccount(ctx) {
    const telegramUserId = ctx.from?.id ? ctx.from.id.toString() : null;
    const chatId = ctx.chat?.id ? ctx.chat.id.toString() : null;

    if (!telegramUserId || !chatId) {
        return ctx.reply('Unable to read your Telegram /chat information.');
    }

    try {
        const userMapping = await getMappingByTelegramId(telegramUserId);
        if (!userMapping) {
            return ctx.reply('អ្នកមិនទាន់បានចុះឈ្មោះនៅឡើយទេ។ មិនអាចធ្វើការផ្ដាច់គណនីបានទេ:\nសូមប្រើ /register ដើម្បីចុះឈ្មោះ។');
        }

        const displayName = userMapping.display_name || userMapping.jira_email;
        const email = userMapping.jira_email;

        // Save to pending map
        pendingDeletions.set(telegramUserId, {
            chatId,
            email,
            displayName
        });

        return ctx.reply(
            `តើអ្នកពិតជាចង់ផ្ដាច់គណនី Jira ${displayName} (${email}) មែនទេ?`,
            Markup.inlineKeyboard([
                Markup.button.callback('✅ បាទ/ចាស', 'confirm_delete_account'),
                Markup.button.callback('❌ ទេ', 'cancel_delete_account')
            ])
        );
    } catch (error) {
        console.error('Error during /deleteaccount command:', error);
        return ctx.reply('An error occurred. Please try again later.');
    }
}

async function handleConfirmDeleteAccount(ctx) {
    await ctx.answerCbQuery().catch(() => {});

    const telegramUserId = ctx.from?.id ? ctx.from.id.toString() : null;
    if (!telegramUserId || !pendingDeletions.has(telegramUserId)) {
        return ctx.editMessageText('មិនមានសំណើផ្ដាច់គណនីដែលកំពុងរង់ចាំនោះទេ។').catch(() => {});
    }

    const pending = pendingDeletions.get(telegramUserId);
    pendingDeletions.delete(telegramUserId);

    try {
        // 1. Delete mapping from database
        await deleteMapping(telegramUserId);

        // 2. Immediately downgrade scoped Telegram command menu back to UNREGISTERED_COMMANDS
        try {
            await ctx.telegram.setMyCommands(UNREGISTERED_COMMANDS, { scope: { type: 'chat', chat_id: pending.chatId } });
        } catch (menuErr) {
            console.error('Failed to reset user command menu:', menuErr.message);
        }

        const deleteSuccessMessage =
            `ផ្ដាច់គណនី Jira ជោគជ័យ! ✅\n\n` +
            `អ្នកបានផ្ដាច់គណនី (${pending.displayName || pending.email}) រួចរាល់ហើយ។\n` +
            `អ្នកអាចប្រើពាក្យបញ្ជា /register ម្តងទៀតគ្រប់ពេលវេលាដើម្បីភ្ជាប់គណនី Jira ថ្មី ឬគណនីដដែល។`;

        await ctx.editMessageText('✅ បានផ្ដាច់គណនីជោគជ័យ!').catch(() => {});
        return ctx.reply(deleteSuccessMessage, getUnregisteredKeyboard());
    } catch (error) {
        console.error('Error during confirm_delete_account:', error);
        return ctx.editMessageText('An error occurred while unlinking your Jira account. Please try again later.').catch(() => {});
    }
}

async function handleCancelDeleteAccount(ctx) {
    await ctx.answerCbQuery().catch(() => {});

    const telegramUserId = ctx.from?.id ? ctx.from.id.toString() : null;
    if (telegramUserId) {
        pendingDeletions.delete(telegramUserId);
    }

    return ctx.editMessageText('ការផ្ដាច់គណនីត្រូវបានលុបចោល។').catch(() => {});
}

module.exports = {
    handleDeleteAccount,
    handleConfirmDeleteAccount,
    handleCancelDeleteAccount
};
