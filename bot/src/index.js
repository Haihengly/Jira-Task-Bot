require('dotenv').config();
const { createBot } = require('./bot');
const { startWebhookServer } = require('./webhook');
const { getAllUsers } = require('./db/mappings');
const { UNREGISTERED_COMMANDS, REGISTERED_COMMANDS } = require('./utils/commands');

async function start() {
    try {
        const bot = createBot();

        // Start webhook server alongside the bot
        startWebhookServer(bot);

        // 1. Set global Telegram command menu for EVERYONE (Unregistered default limit)
        await bot.telegram.setMyCommands(UNREGISTERED_COMMANDS, { scope: { type: 'default' } });

        // 2. Fetch all registered users and upgrade their specific menus
        try {
            const users = await getAllUsers();
            if (users && users.length > 0) {
                console.log(`Setting up command menus for ${users.length} registered users...`);

                for (const user of users) {
                    try {
                        await bot.telegram.setMyCommands(REGISTERED_COMMANDS, { scope: { type: 'chat', chat_id: user.chat_id } });
                    } catch (err) {
                        console.error(`Failed to set commands for chat_id ${user.chat_id}:`, err.message);
                    }
                }
                console.log(`Commands updated for registered users.`);
            }
        } catch (dbErr) {
            console.error('Failed to query user menus:', dbErr.message);
        }

        // Graceful stop listeners
        process.once('SIGINT', () => bot.stop('SIGINT'));
        process.once('SIGTERM', () => bot.stop('SIGTERM'));

        console.log('Starting Telegram bot in polling mode...');
        bot.launch();
        console.log('Bot is running and listening for messages!');

    } catch (err) {
        console.error('Failed to start the bot:', err);
        process.exit(1);
    }
}

start();
