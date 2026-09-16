const jiraClient = require('../jira/client');
const { saveMapping, getMappingByTelegramId } = require('../db/mappings');

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

        await saveMapping(telegramUserId, chatId, jiraUser.accountId, email);

        let replyMessage = `ចុះឈ្មោះជោគជ័យ! 🎉\n`;

        if (existingMapping && existingMapping.jira_email && existingMapping.jira_email.toLowerCase() !== email.toLowerCase()) {
            replyMessage += `គណនី Jira របស់អ្នកត្រូវបានផ្លាស់ប្តូរពី ${existingMapping.jira_email} ទៅ ${email}។\n`;
        }

        replyMessage +=
            `គណនី Telegram ត្រូវបានភ្ជាប់ជាមួយគណនី Jira (${jiraUser.displayName || email})។\n\n` +
            `ឥឡូវនេះអ្នកអាចប្រើ:\n` +
            `/todo - មើលកិច្ចការត្រូវធ្វើ\n` +
            `/inprogress - មើលកិច្ចការកំពុងធ្វើ\n` +
            `/done - មើលកិច្ចការដែលបានធ្វើរួច\n` +
            `/help - មើលរបៀបប្រើប្រាស់ និងពាក្យបញ្ជាទាំងអស់`;

        return ctx.reply(replyMessage);
    } catch (error) {
        console.error('Error during /register command:', error);
        return ctx.reply('An error occurred while linking your Jira account. Please try again later.');
    }
}

module.exports = {
    handleRegister
};