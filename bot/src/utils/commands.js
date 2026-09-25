const { Markup } = require('telegraf');

const UNREGISTERED_COMMANDS = [
    { command: 'register', description: 'ភ្ជាប់គណនី Jira របស់អ្នក' },
    { command: 'help', description: 'មើលអំពីរបៀបប្រើប្រាស់' }
];

const REGISTERED_COMMANDS = [
    { command: 'register', description: 'ភ្ជាប់គណនី Jira របស់អ្នក' },
    { command: 'myaccount', description: 'មើលព័ត៌មានគណនីរបស់អ្នក' },
    { command: 'mytasks', description: 'មើលកិច្ចការរបស់អ្នក' },
    { command: 'help', description: 'មើលអំពីរបៀបប្រើប្រាស់' },
    { command: 'deleteaccount', description: 'ផ្ដាច់គណនី Jira' }
];

const KEYBOARD_BUTTONS = {
    REGISTER: '✍️ ចុះឈ្មោះ',
    MY_TASKS: '📋 កិច្ចការរបស់ខ្ញុំ',
    MY_ACCOUNT: '👤 គណនីរបស់ខ្ញុំ',
    HELP: '❓ ជំនួយ',
    DELETE_ACCOUNT: '🔴 ផ្ដាច់គណនី'
};

function getRegisteredKeyboard() {
    return Markup.keyboard([
        [KEYBOARD_BUTTONS.MY_TASKS],
        [KEYBOARD_BUTTONS.MY_ACCOUNT, KEYBOARD_BUTTONS.HELP],
        [KEYBOARD_BUTTONS.DELETE_ACCOUNT]
    ]).resize();
}

function getUnregisteredKeyboard() {
    return Markup.keyboard([
        [KEYBOARD_BUTTONS.REGISTER, KEYBOARD_BUTTONS.HELP]
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
    getUnregisteredKeyboard,
    generateHelpCommandList
};
