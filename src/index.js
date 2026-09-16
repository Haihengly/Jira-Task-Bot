require('dotenv').config();
const { createBot } = require('./bot');

async function start() {
    try {
        const bot = createBot();

        // Set Telegram command menu
        await bot.telegram.setMyCommands([
            { command: 'register', description: 'ភ្ជាប់គណនី Jira របស់អ្នក' },
            { command: 'todo', description: 'មើលកិច្ចការត្រូវធ្វើ' },
            { command: 'inprogress', description: 'មើលកិច្ចការកំពុងធ្វើ' },
            { command: 'done', description: 'មើលកិច្ចការដែលបានធ្វើរួច' }
        ]);

        // Graceful stop listeners
        process.once('SIGINT', () => bot.stop('SIGINT'));
        process.once('SIGTERM', () => bot.stop('SIGTERM'));

        console.log('Starting Telegram bot in polling mode...');
        await bot.launch();
        console.log('Bot is running and listening for messages!');
    } catch (err) {
        console.error('Failed to start the bot:', err);
        process.exit(1);
    }
}

start();
