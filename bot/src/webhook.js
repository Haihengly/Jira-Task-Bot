const express = require('express');
const { createOAuthRouter } = require('./routes/oauth');
const { createInternalReportRouter } = require('./routes/internalReport');
const { createJiraWebhookRouter } = require('./routes/jiraWebhook');

function startWebhookServer(bot) {
    const app = express();
    const port = process.env.PORT || 3030;

    // Parse JSON bodies
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    app.use(createOAuthRouter(bot));
    app.use(createInternalReportRouter());
    app.use(createJiraWebhookRouter(bot));

    app.listen(port, () => {
        console.log(`Express webhook server listening on port ${port}`);
    });

    return app;
}

module.exports = {
    startWebhookServer
};
