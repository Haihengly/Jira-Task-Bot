const express = require('express');
const { getMappingByJiraAccountId } = require('./db/mappings');

function startWebhookServer(bot) {
    const app = express();
    const port = process.env.PORT || 3000;

    // Parse JSON bodies
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    app.post('/webhook/jira', async (req, res) => {
        try {
            console.log('Received Jira webhook payload (event:', req.body.issue_event_type_name, ')');

            if (req.body.issue_event_type_name === 'issue_assigned') {
                const assigneeItem = req.body.changelog?.items?.find(item => item.field === 'assignee');

                if (assigneeItem && assigneeItem.to) {
                    const newAssigneeAccountId = assigneeItem.to;
                    const mapping = await getMappingByJiraAccountId(newAssigneeAccountId);

                    if (mapping && mapping.chat_id) {
                        const issueKey = req.body.issue?.key;
                        const summary = req.body.issue?.fields?.summary;
                        const projectName = req.body.issue?.fields?.project?.name;

                        const message = `🔔 អ្នកត្រូវបានចាត់តាំងកិច្ចការថ្មី!\n🗂 ${projectName}\n${issueKey}: ${summary}`;

                        try {
                            await bot.telegram.sendMessage(mapping.chat_id, message);
                            console.log(`Delivered assignment notification for ${issueKey} to chat ${mapping.chat_id}`);
                        } catch (telegramErr) {
                            console.error(`Failed to send Telegram message to chat ${mapping.chat_id}:`, telegramErr.message || telegramErr);
                        }
                    } else {
                        console.log(`No Telegram mapping found for Jira account ${newAssigneeAccountId}`);
                    }
                }
            }
        } catch (err) {
            console.error('Error processing webhook:', err);
        } finally {
            // Always respond 200 so Jira doesn't retry unnecessarily
            res.status(200).send('OK');
        }
    });

    app.listen(port, () => {
        console.log(`Express webhook server listening on port ${port}`);
    });

    return app;
}

module.exports = {
    startWebhookServer
};