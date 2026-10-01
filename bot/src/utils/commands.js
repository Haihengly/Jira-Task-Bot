const { Markup } = require('telegraf');

const UNREGISTERED_COMMANDS = [
    { command: 'link', description: 'ភ្ជាប់គណនី Jira របស់អ្នក' },
    { command: 'help', description: 'មើលអំពីរបៀបប្រើប្រាស់' }
];

const REGISTERED_COMMANDS = [
    { command: 'myaccount', description: 'មើលព័ត៌មានគណនីរបស់អ្នក' },
    { command: 'mytasks', description: 'មើលកិច្ចការរបស់អ្នក' },
    { command: 'changeaccount', description: 'ប្តូរគណនី Jira' },
    { command: 'help', description: 'មើលអំពីរបៀបប្រើប្រាស់' },
    { command: 'deleteaccount', description: 'ផ្ដាច់គណនី Jira' }
];

const KEYBOARD_BUTTONS = {
    LINK: '🔗 ភ្ជាប់គណនី Jira',
    MY_TASKS: '📋 កិច្ចការរបស់ខ្ញុំ',
    MY_ACCOUNT: '👤 គណនីរបស់ខ្ញុំ',
    CHANGE_ACCOUNT: '🔄 ប្តូរគណនី',
    HELP: '❓ ជំនួយ',
    EXPORT_PDF: '📄 នាំចេញជា PDF',
    DELETE_ACCOUNT: '🔴 ផ្ដាច់គណនី',
    PDF_TODAY: '📊 ថ្ងៃនេះ',
    PDF_DATE_RANGE: '📅 ចន្លោះកាលបរិច្ឆេទ',
    TASK_TODO: '📋 ត្រូវធ្វើ',
    TASK_INPROGRESS: '🔄 កំពុងធ្វើ',
    TASK_DONE: '✅ បានធ្វើរួច',
    BACK: '⬅️ ត្រឡប់ក្រោយ'
};

function getRegisteredKeyboard() {
    return Markup.keyboard([
        [KEYBOARD_BUTTONS.MY_TASKS, KEYBOARD_BUTTONS.MY_ACCOUNT],
        [KEYBOARD_BUTTONS.CHANGE_ACCOUNT, KEYBOARD_BUTTONS.HELP],
        [KEYBOARD_BUTTONS.EXPORT_PDF],
        [KEYBOARD_BUTTONS.DELETE_ACCOUNT]
    ]).resize();
}

function getTasksKeyboard() {
    return Markup.keyboard([
        [KEYBOARD_BUTTONS.TASK_TODO, KEYBOARD_BUTTONS.TASK_INPROGRESS, KEYBOARD_BUTTONS.TASK_DONE],
        [KEYBOARD_BUTTONS.BACK]
    ]).resize();
}

function getPdfHubKeyboard() {
    return Markup.keyboard([
        [KEYBOARD_BUTTONS.PDF_TODAY],
        [KEYBOARD_BUTTONS.PDF_DATE_RANGE],
        [KEYBOARD_BUTTONS.BACK]
    ]).resize();
}

function getUnregisteredKeyboard() {
    return Markup.keyboard([
        [KEYBOARD_BUTTONS.LINK, KEYBOARD_BUTTONS.HELP]
    ]).resize();
}

// Helper to generate the text for the /help command
function generateHelpCommandList(commands) {
    return commands.map(c => `/${c.command} - ${c.description}`).join('\n');
}

module.exports = {
    UNREGISTERED_COMMANDS,
    REGISTERED_COMMANDS,
    KEYBOARD_BUTTONS,
    getRegisteredKeyboard,
    getTasksKeyboard,
    getPdfHubKeyboard,
    getUnregisteredKeyboard,
    generateHelpCommandList
};
