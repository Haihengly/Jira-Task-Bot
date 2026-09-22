const { Markup } = require('telegraf');
const jiraClient = require('../jira/client');
const { saveMapping, getMappingByTelegramId } = require('../db/mappings');

// In-memory store for pending confirmations: telegramUserId -> { status, chatId, accountId, email, displayName, existingMapping }
const pendingRegistrations = new Map();

async function handleRegister(ctx) {
    const text = ctx.message?.text || '';
    const args = text.split(/\s+/).slice(1);
    const email = args[0]?.trim();

    if (!email) {
        return ctx.reply('សូមផ្តល់អ៊ីមែល Jira របស់អ្នក។\nឧទាហរណ៍: /register jira@example.com');
    }

    const telegramUserId = ctx.from?.id ? ctx.from.id.toString() : null;
    const chatId = ctx.chat?.id ? ctx.chat.id.toString() : null;

    if (!telegramUserId || !chatId) {
        return ctx.reply('Unable to read your Telegram /chat information.');
    }

    try {
        const jiraUser = await jiraClient.findUserByEmail(email);

        if (!jiraUser || !jiraUser.accountId) {
            return ctx.reply(
                `រកមិនឃើញគណនី Jira ដែលមានអ៊ីមែល "${email}" ទេ។ ` +
                `សូមពិនិត្យអ៊ីមែលម្តងទៀត ឬសាកសួរអ្នកគ្រប់គ្រង Jira របស់អ្នក។`
            );
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

async function handleConfirmRegister(ctx) {
    await ctx.answerCbQuery().catch(() => {});

    const telegramUserId = ctx.from?.id ? ctx.from.id.toString() : null;
    if (!telegramUserId || !pendingRegistrations.has(telegramUserId)) {
        return ctx.editMessageText('មិនមានការចុះឈ្មោះដែលកំពុងរង់ចាំនោះទេ។ សូមប្រើ /register ម្តងទៀត។').catch(() => {});
    }

    const pending = pendingRegistrations.get(telegramUserId);

    // Bypass verification, directly register
    pendingRegistrations.delete(telegramUserId);

    try {
        await saveMapping(telegramUserId, pending.chatId, pending.accountId, pending.email, pending.displayName);

        let replyMessage = `ចុះឈ្មោះជោគជ័យ! 🎉\n`;

        if (pending.existingMapping && pending.existingMapping.jira_email && pending.existingMapping.jira_email.toLowerCase() !== pending.email.toLowerCase()) {
            replyMessage += `គណនី Jira របស់អ្នកត្រូវបានផ្លាស់ប្តូរពី ${pending.existingMapping.jira_email} ទៅ ${pending.email}។\n`;
        }

        replyMessage +=
            `គណនី Telegram ត្រូវបានភ្ជាប់ជាមួយគណនី Jira (${pending.displayName || pending.email})។\n\n` +
            `ឥឡូវនេះអ្នកអាចប្រើ:\n` +
            `/myaccount - មើលព័ត៌មានគណនីរបស់អ្នក\n` +
            `/todo - មើលកិច្ចការត្រូវធ្វើ\n` +
            `/inprogress - មើលកិច្ចការកំពុងធ្វើ\n` +
            `/done - មើលកិច្ចការដែលបានធ្វើរួច\n` +
            `/help - មើលរបៀបប្រើប្រាស់ និងពាក្យបញ្ជាទាំងអស់`;

        return ctx.editMessageText(replyMessage);
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
    handleConfirmRegister,
    handleCancelRegister
};
