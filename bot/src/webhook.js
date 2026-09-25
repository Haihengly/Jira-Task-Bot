const express = require('express');
const { getMappingByJiraAccountId } = require('./db/mappings');
const jiraClient = require('./jira/client');
const { getTodayDateString, formatPriorityAndDue, escapeMarkdown } = require('./utils');

function startWebhookServer(bot) {
    const app = express();
    const port = process.env.PORT || 3030;

    // Parse JSON bodies
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    app.post('/webhook/jira', async (req, res) => {
        try {
            console.log('Received Jira webhook payload (event:', req.body.issue_event_type_name, ')');
            console.log('Received Jira webhook payload (event:', req.body, ')');

            if (req.body.issue_event_type_name === 'issue_assigned') {
                const assigneeItem = req.body.changelog?.items?.find(item => item.field === 'assignee');

                if (assigneeItem && assigneeItem.to) {
                    const newAssigneeAccountId = assigneeItem.to;
                    const mapping = await getMappingByJiraAccountId(newAssigneeAccountId);

                    if (mapping && mapping.chat_id) {
                        const issueKey = req.body.issue?.key;
                        let issueFields = req.body.issue?.fields;

                        // If priority, duedate, project, or summary is missing, fetch extra details
                        if (issueKey && (!issueFields || issueFields.priority === undefined || issueFields.duedate === undefined || !issueFields.project || !issueFields.summary)) {
                            try {
                                const fetched = await jiraClient.getIssueByKey(issueKey, 'summary,priority,duedate,project');
                                if (fetched && fetched.fields) {
                                    issueFields = {
                                        ...issueFields,
                                        ...fetched.fields
                                    };
                                }
                            } catch (error) {
                                console.error(`Failed to fetch additional Jira issue fields for ${issueKey}:`, error.message);
                            }
                        }

                        const baseUrl = (process.env.JIRA_BASE_URL || '').replace(/\/+$/, '');
                        const issueUrl = baseUrl && issueKey ? `${baseUrl}/browse/${issueKey}` : '';
                        const projectName = issueFields?.project?.name || 'Unknown Project';
                        const summary = issueFields?.summary || 'No summary';
                        const priorityName = issueFields?.priority?.name || 'None';
                        const dueDate = issueFields?.duedate;
                        const assignerName = req.body.user?.displayName || 'Unknown';
                        const today = getTodayDateString();

                        const priorityAndDueText = formatPriorityAndDue(priorityName, dueDate, {
                            withPriorityLabel: true,
                            alwaysShowDueDate: true,
                            today
                        });

                        const formattedKey = issueUrl ? `[${issueKey}](${issueUrl})` : (issueKey || '');

                        const message =
                            `🔔 អ្នកត្រូវបានចាត់តាំងកិច្ចការថ្មី!\n\n` +
                            `🗂 ${escapeMarkdown(projectName)}\n\n` +
                            `ចាត់តាំងដោយ: ${escapeMarkdown(assignerName)}\n\n` +
                            `${formattedKey}: ${escapeMarkdown(summary)}\n\n` +
                            `${priorityAndDueText}`;

                        try {
                            await bot.telegram.sendMessage(mapping.chat_id, message, {
                                parse_mode: 'Markdown',
                                disable_web_page_preview: true
                            });
                            console.log(`Delivered assignment notification for ${issueKey} to chat ${mapping.chat_id}`);
                        } catch (telegramErr) {
                            console.error(`Failed to send Telegram message to chat ${mapping.chat_id}:`, telegramErr.message || telegramErr);

                            // Fallback to plain text if Markdown parsing fails
                            try {
                                const plainMessage =
                                    `🔔 អ្នកត្រូវបានចាត់តាំងកិច្ចការថ្មី!\n\n` +
                                    `🗂 ${projectName}\n\n` +
                                    `ចាត់តាំងដោយ: ${assignerName}\n\n` +
                                    `${issueKey}: ${summary}\n\n` +
                                    `${priorityAndDueText.replace(' ⚠️ ផុតកំណត់', ' (ផុតកំណត់)')}`;
                                await bot.telegram.sendMessage(mapping.chat_id, plainMessage, {
                                    disable_web_page_preview: true
                                });
                            } catch (fallbackErr) {
                                console.error(`Failed to send fallback Telegram message to chat ${mapping.chat_id}:`, fallbackErr.message || fallbackErr);
                            }
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
