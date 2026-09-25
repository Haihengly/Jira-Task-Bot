const { Markup } = require('telegraf');
const jiraClient = require('../jira/client');
const { saveMapping, getMappingByTelegramId, getMappingByJiraAccountId } = require('../db/mappings');
const { REGISTERED_COMMANDS, getRegisteredKeyboard } = require('../utils/commands');

// In-memory store for pending confirmations: telegramUserId -> { status, chatId, accountId, email, displayName, existingMapping }
const pendingRegistrations = new Map();

// In-memory store for conversational email prompt
const awaitingEmails = new Map();

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

        // Save to in-memory pending confirmations (overwrites any previous pending confirmation)
        pendingRegistrations.set(telegramUserId, {
            status: 'PENDING_CONFIRM',
            chatId,
            accountId: jiraUser.accountId,
            email,
            displayName,
            existingMapping
        });

        // Successfully found user and ready for confirmation, clear the conversational state
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
        console.error('Error during /register command:', error);
        return ctx.reply('An error occurred while linking your Jira account. Please try again later.');
    }
}

async function handleRegister(ctx) {
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

    const text = ctx.message?.text || '';
    let email = null;

    if (text.startsWith('/register')) {
        const args = text.split(/\s+/).slice(1);
        email = args[0]?.trim();
    }

    // Reset awaiting state
    awaitingEmails.delete(telegramUserId);

    if (!email) {
        awaitingEmails.set(telegramUserId, true);
        return ctx.reply('សូមផ្ញើអ៊ីមែល Jira របស់អ្នក:');
    }

    if (!isValidEmail(email)) {
        awaitingEmails.set(telegramUserId, true);
        return ctx.reply('ការបញ្ចូលមិនមែនជាទម្រង់អ៊ីមែលត្រឹមត្រូវទេ សូមព្យាយាមម្តងទៀត (ឧទាហរណ៍: name@example.com):');
    }

    return processEmailSearch(ctx, email, telegramUserId, chatId);
}

async function handleChangeAccount(ctx) {
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

    const text = ctx.message?.text || '';
    let email = null;

    if (text.startsWith('/changeaccount')) {
        const args = text.split(/\s+/).slice(1);
        email = args[0]?.trim();
    }

    // Reset awaiting state
    awaitingEmails.delete(telegramUserId);

    if (!email) {
        awaitingEmails.set(telegramUserId, true);
        const currentEmail = existingMapping.jira_email || 'គណនីមុន';
        return ctx.reply(`អ្នកបានចុះឈ្មោះរួចជាមួយ ${currentEmail}។\nសូមផ្ញើអ៊ីមែល Jira ថ្មីដែលអ្នកចង់ប្តូរទៅ:`);
    }

    if (!isValidEmail(email)) {
        awaitingEmails.set(telegramUserId, true);
        return ctx.reply('ការបញ្ចូលមិនមែនជាទម្រង់អ៊ីមែលត្រឹមត្រូវទេ សូមព្យាយាមម្តងទៀត (ឧទាហរណ៍: name@example.com):');
    }

    return processEmailSearch(ctx, email, telegramUserId, chatId);
}

function isAwaitingEmail(telegramUserId) {
    return awaitingEmails.has(telegramUserId);
}

function cancelAwaitingEmail(telegramUserId) {
    if (telegramUserId) {
        awaitingEmails.delete(telegramUserId);
    }
}

async function handleConversationalEmail(ctx) {
    const telegramUserId = ctx.from?.id ? ctx.from.id.toString() : null;
    const chatId = ctx.chat?.id ? ctx.chat.id.toString() : null;
    const text = ctx.message?.text?.trim() || '';

    if (!telegramUserId || !chatId || text.startsWith('/')) {
        return;
    }

    // Simple email format check
    if (!isValidEmail(text)) {
        return ctx.reply('ការបញ្ចូលមិនមែនជាទម្រង់អ៊ីមែលត្រឹមត្រូវទេ សូមព្យាយាមម្តងទៀត (ឧទាហਰណ៍: name@example.com):');
    }

    return processEmailSearch(ctx, text, telegramUserId, chatId);
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
            `/mytasks - មើលកិច្ចការរបស់អ្នក (មានប៊ូតុងជ្រើសរើស)\n` +
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

module.exports = {
    handleRegister,
    handleChangeAccount,
    handleConfirmRegister,
    handleCancelRegister,
    isAwaitingEmail,
    cancelAwaitingEmail,
    handleConversationalEmail
};
