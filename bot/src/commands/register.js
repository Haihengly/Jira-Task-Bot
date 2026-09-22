const { Markup } = require('telegraf');
const { Resend } = require('resend');
const jiraClient = require('../jira/client');
const { saveMapping, getMappingByTelegramId } = require('../db/mappings');

// In-memory store for pending confirmations: telegramUserId -> { status, chatId, accountId, email, displayName, existingMapping, verificationCode, expiresAt }
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

    if (pending.status === 'VERIFYING') {
        return ctx.editMessageText('យើងបានផ្ញើកូដរួចហើយ។ សូមពិនិត្យមើលអ៊ីមែលរបស់អ្នក។').catch(() => {});
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    pending.status = 'VERIFYING';
    pending.verificationCode = code;
    pending.expiresAt = expiresAt;

    try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
            from: 'onboarding@resend.dev',
            to: pending.email,
            subject: 'Your Jira Bot Verification Code',
            text: `Your verification code is: ${code}\nThis code expires in 10 minutes.`,
            html: `<p>Your verification code is: <strong>${code}</strong></p><p>This code expires in 10 minutes.</p>`
        });

        return ctx.editMessageText('កូដផ្ទៀងផ្ទាត់ត្រូវបានផ្ញើទៅអ៊ីមែលរបស់អ្នកហើយ។ សូមផ្ញើកូដ 6 ខ្ទង់មកកាន់ bot នេះក្នុងរយៈពេល 10 នាទី។');
    } catch (error) {
        console.error('Error sending verification email:', error);
        pendingRegistrations.delete(telegramUserId);
        return ctx.editMessageText('មានបញ្ហាក្នុងការផ្ញើអ៊ីមែលផ្ទៀងផ្ទាត់។ សូមព្យាយាមចុះឈ្មោះម្តងទៀត។ (Failed to send verification email. Please try registering again.)');
    }
}

async function handleVerificationMessage(ctx) {
    const telegramUserId = ctx.from?.id ? ctx.from.id.toString() : null;
    if (!telegramUserId || !pendingRegistrations.has(telegramUserId)) {
        return false;
    }

    const pending = pendingRegistrations.get(telegramUserId);
    if (pending.status !== 'VERIFYING') {
        return false;
    }

    const text = ctx.message?.text?.trim() || '';

    if (/^\d{6}$/.test(text)) {
        if (Date.now() > pending.expiresAt) {
            pendingRegistrations.delete(telegramUserId);
            await ctx.reply('កូដផ្ទៀងផ្ទាត់របស់អ្នកបានផុតកំណត់។ សូមប្រើ /register ម្តងទៀត។ (Verification code has expired. Please run /register again.)');
            return true;
        }

        if (text === pending.verificationCode) {
            // Correct code
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

                await ctx.reply(replyMessage);
                return true;
            } catch (error) {
                console.error('Error saving mapping during verification:', error);
                await ctx.reply('An error occurred while linking your Jira account. Please try again later.');
                return true;
            }
        } else {
            // Wrong code
            await ctx.reply('កូដផ្ទៀងផ្ទាត់មិនត្រឹមត្រូវទេ។ សូមព្យាយាមម្តងទៀត។ (Incorrect verification code. Please try again.)');
            return true;
        }
    }

    return false;
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
    handleCancelRegister,
    handleVerificationMessage
};
