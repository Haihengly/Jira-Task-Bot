const axios = require('axios');

class JiraClient {
    constructor() {
        this.baseUrl = process.env.JIRA_BASE_URL;
        this.email = process.env.JIRA_EMAIL;
        this.apiToken = process.env.JIRA_API_TOKEN;

        if (!this.baseUrl || !this.email || !this.apiToken) {
            console.warn('WARNING: Missing Jira configuration in environment variables.');
        }

        const authToken = Buffer.from(`${this.email}:${this.apiToken}`).toString('base64');

        this.client = axios.create({
            baseURL: this.baseUrl,
            headers: {
                'Authorization': `Basic ${authToken}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });
    }

    /**
     * Search for a user by email
     * @param {string} email
     * @returns {Promise<Object|null>} user object or null if not found
     */
    async findUserByEmail(email) {
        try {
            const response = await this.client.get(`/rest/api/3/user/search`, {
                params: { query: email }
            });
            if (response.data && response.data.length > 0) {
                return response.data[0];
            }
            return null;
        } catch (error) {
            console.error('Error finding user in Jira:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Search issues for a specific accountId and status
     * @param {string} accountId
     * @param {string} status 'To Do', 'In Progress', 'Done'
     * @param {string} [fields='summary,status,assignee,priority,duedate']
     * @returns {Promise<Array>} List of issues
     */
    async getIssuesByAssigneeAndStatus(accountId, status, fields = 'summary,status,assignee,priority,duedate') {
        try {
            const jql = `assignee = "${accountId}" AND status = "${status}"`;
            const response = await this.client.get(`/rest/api/3/search/jql`, {
                params: {
                    jql,
                    fields
                }
            });
            return response.data.issues || [];
        } catch (error) {
            console.error('Error retrieving Jira issues:', error.response?.data || error.message);
            throw error;
        }
    }
}

// Export a singleton instance
module.exports = new JiraClient();
