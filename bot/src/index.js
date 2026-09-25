require('dotenv').config();
const { createBot } = require('./bot');
const { startWebhookServer } = require('./webhook');
const { getAllUsers } = require('./db/mappings');

async function start() {
    try {
        const bot = createBot();

        // Start webhook server alongside the bot
        startWebhookServer(bot);

        // 1. Set global Telegram command menu for EVERYONE (Unregistered default limit)
        await bot.telegram.setMyCommands([
            { command: 'register', description: 'ភ្ជាប់គណនី Jira របស់អ្នក' },
            { command: 'help', description: 'មើលអំពីរបៀបប្រើប្រាស់' }
        ], { scope: { type: 'default' } });

        // Graceful stop listeners
        process.once('SIGINT', () => bot.stop('SIGINT'));
        process.once('SIGTERM', () => bot.stop('SIGTERM'));

        console.log('Starting Telegram bot in polling mode...');
        await bot.launch();
        console.log('Bot is running and listening for messages!');

        // 2. Fetch all registered users and upgrade their specific menus in background
        try {
            const users = await getAllUsers();
            if (users && users.length > 0) {
                console.log(`Setting up command menus for ${users.length} registered users...`);

                const registeredCommands = [
                    { command: 'register', description: 'ភ្ជាប់គណនី Jira របស់អ្នក' },
                    { command: 'myaccount', description: 'មើលព័ត៌មានគណនីរបស់អ្នក' },
                    { command: 'todo', description: 'មើលកិច្ចការត្រូវធ្វើ' },
                    { command: 'inprogress', description: 'មើលកិច្ចការកំពុងធ្វើ' },
                    { command: 'done', description: 'មើលកិច្ចការដែលបានធ្វើរួច' },
                    { command: 'help', description: 'មើលអំពីរបៀបប្រើប្រាស់' }
                ];

                for (const user of users) {
                     try {
                        await bot.telegram.setMyCommands(registeredCommands, { scope: { type: 'chat', chat_id: user.chat_id } });
                     } catch (err) {
                        console.error(`Failed to set commands for chat_id ${user.chat_id}:`, err.message);
                     }
                }
                console.log(`Commands updated for registered users.`);
            }
        } catch (dbErr) {
            console.error('Failed to update user menus:', dbErr.message);
        }

    } catch (err) {
        console.error('Failed to start the bot:', err);
        process.exit(1);
    }
}

start();
