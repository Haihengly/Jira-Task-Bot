require('dotenv').config();
const { createBot } = require('./bot');

async function start() {
    try {
        const bot = createBot();

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
