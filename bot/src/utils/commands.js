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

// Helper to generate the text for the /help command
function generateHelpCommandList(commands) {
    return commands.map(c => `/${c.command} - ${c.description}`).join('\n');
}

module.exports = {
    UNREGISTERED_COMMANDS,
    REGISTERED_COMMANDS,
    generateHelpCommandList
};