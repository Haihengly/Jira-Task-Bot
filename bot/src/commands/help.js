const { getMappingByTelegramId } = require('../db/mappings');
const { REGISTERED_COMMANDS, generateHelpCommandList } = require('../utils/commands');

function getStartMessage() {
    return (
        `សូមស្វាគមន៍មកកាន់ Jira Task Tracker Bot! 👋\n\n` +
        `សូមធ្វើការចុចប៊ូតុង "🔗 ភ្ជាប់គណនី Jira" ឬក៏បញ្ចូលពាក្យបញ្ជា /link ដើម្បីភ្ជាប់គណនី Telegram របស់អ្នកទៅកាន់ Jira 🔗\n\n` +
        `សូមអរគុណ 🙏`
    );
}

function getRegisteredStartMessage(mapping) {
    let accountInfo = 'គណនីរបស់អ្នក';
    if (mapping) {
        if (mapping.display_name && mapping.jira_email && mapping.display_name !== mapping.jira_email) {
            accountInfo = `${mapping.display_name} (${mapping.jira_email})`;
        } else {
            accountInfo = mapping.display_name || mapping.jira_email || 'គណនីរបស់អ្នក';
        }
    }
    return (
        `សូមស្វាគមន៍មកកាន់ Jira Task Tracker Bot! 👋\n\n` +
        `អ្នកបានភ្ជាប់គណនីរួចជាមួយ ${accountInfo} ។\n` +
        `ប្រើប្រាស់ប៊ូតុងខាងក្រោម ឬពាក្យបញ្ជា /help ដើម្បីមើលអំពីអ្វីដែលអ្នកអាចធ្វើបាន។`
    );
}

function getUnregisteredHelpMessage() {
    return (
        `📖 របៀបភ្ជាប់គណនី ៖\n\n` +
        `សូមធ្វើការចុចប៊ូតុង "🔗 ភ្ជាប់គណនី Jira" ឬក៏បញ្ចូលពាក្យបញ្ជា /link ដើម្បីភ្ជាប់គណនី Telegram របស់អ្នកទៅកាន់ Jira 🔗`
    );
}

function getRegisteredHelpMessage() {
    return (
        `របៀបប្រើប្រាស់ និងពាក្យបញ្ជាដែលអាចប្រើបាន: 📋\n\n` +
        generateHelpCommandList(REGISTERED_COMMANDS)
    );
}

async function handleHelp(ctx) {
    if (ctx.payload && ctx.payload.trim().length > 0) {
        return ctx.reply('ពាក្យបញ្ជានេះមិនត្រូវការអ្វីផ្សេងទៀតទេ។ សូមប្រើ /help ដោយគ្មានពាក្យផ្សេងទៀត។');
    }

    const telegramUserId = ctx.from?.id ? ctx.from.id.toString() : null;
    let userMapping = null;
    if (telegramUserId) {
        userMapping = await getMappingByTelegramId(telegramUserId);
    }

    if (!userMapping) {
        return ctx.reply(getUnregisteredHelpMessage());
    }

    return ctx.reply(getRegisteredHelpMessage());
}

module.exports = {
    handleHelp,
    getStartMessage,
    getRegisteredStartMessage,
    getUnregisteredHelpMessage,
    getRegisteredHelpMessage
};
