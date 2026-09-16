require('dotenv').config();
const { createBot } = require('./bot');

async function start() {
    try {
        const bot = createBot();

        // Set Telegram command menu
        await bot.telegram.setMyCommands([
            { command: 'register', description: 'Link your Telegram to your Jira account' },
            { command: 'todo', description: 'View your To Do tasks' },
            { command: 'inprogress', description: 'View your In Progress tasks' },
            { command: 'done', description: 'View your Done tasks' }
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
