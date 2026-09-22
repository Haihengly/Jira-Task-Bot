function getTodayDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getKhmerPriority(priorityName) {
    if (!priorityName || priorityName.toLowerCase() === 'none') {
        return { emoji: '⚪', label: 'គ្មាន' };
    }

    const lower = priorityName.toLowerCase();

    // Exact or substring matches, ordered specifically to prevent 'highest' triggering 'high'
    if (lower.includes('highest')) return { emoji: '🔴', label: 'ខ្ពស់បំផុត' };
    if (lower.includes('high')) return { emoji: '🟠', label: 'ខ្ពស់' };
    if (lower.includes('medium')) return { emoji: '🟡', label: 'មធ្យម' };
    if (lower.includes('lowest')) return { emoji: '⚪', label: 'ទាបបំផុត' };
    if (lower.includes('low')) return { emoji: '🔵', label: 'ទាប' };

    return { emoji: '⚪', label: 'គ្មាន' };
}

function formatDueDate(dueDateStr) {
    if (!dueDateStr) return null;
    const [year, month, day] = dueDateStr.split('-').map(Number);
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    if (!month || isNaN(month) || month < 1 || month > 12) return dueDateStr;
    return `${monthNames[month - 1]} ${day}`;
}

function formatPriorityAndDue(priorityName, dueDate, options = {}) {
    const {
        withPriorityLabel = false,
        today = getTodayDateString(),
        alwaysShowDueDate = false
    } = options;
    const { emoji, label } = getKhmerPriority(priorityName);
    const formattedDueDate = formatDueDate(dueDate);
    const isOverdue = dueDate && dueDate < today;

    let dueText = '';
    if (formattedDueDate) {
        dueText = ` | ថ្ងៃកំណត់៖ ${formattedDueDate}${isOverdue ? ' ⚠️ ផុតកំណត់' : ''}`;
    } else if (alwaysShowDueDate) {
        dueText = ` | ថ្ងៃកំណត់៖ គ្មាន`;
    }

    const priorityText = withPriorityLabel ? `អតិភាព: ${label}` : label;
    return `${emoji} ${priorityText}${dueText}`;
}

// Basic markdown escaper for common characters that could break parsing
function escapeMarkdown(text) {
    if (!text) return '';
    return text.toString().replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

/**
 * Helper to sort issues by urgency.
 */
function sortIssuesByUrgency(issues, today) {
    issues.sort((a, b) => {
        const dueA = a.fields?.duedate;
        const dueB = b.fields?.duedate;

        const getCategory = (due) => {
            if (!due) return 3;
            if (due < today) return 1;
            return 2;
        };

        const catA = getCategory(dueA);
        const catB = getCategory(dueB);

        if (catA !== catB) {
            return catA - catB;
        }

        if (dueA && dueB) {
            return dueA.localeCompare(dueB);
        }

        return (a.key || '').localeCompare(b.key || '');
    });
}

/**
 * Formats a list of issues into strings lines.
 */
function formatIssuesBlock(issues, baseUrl) {
    let block = '';
    const today = getTodayDateString();
    
    issues.forEach((issue) => {
        const issueKey = issue.key;
        const summary = issue.fields?.summary || 'No summary';
        const issueUrl = `${baseUrl}/browse/${issueKey}`;

        const priorityName = issue.fields?.priority?.name || 'None';
        const dueDate = issue.fields?.duedate;
        const priorityAndDueText = formatPriorityAndDue(priorityName, dueDate, {
            withPriorityLabel: true,
            alwaysShowDueDate: true,
            today
        });

        block += `[${issueKey}](${issueUrl}): ${escapeMarkdown(summary)}\n`;
        block += `   ${priorityAndDueText}\n\n`;
    });
    return block;
}

/**
 * Merges To Do and In Progress tasks, loops through each project space once.
 */
function formatCombinedTaskList(todoIssues, inProgressIssues, baseUrl) {
    const hasTodo = todoIssues && todoIssues.length > 0;
    const hasInProgress = inProgressIssues && inProgressIssues.length > 0;
    
    if (!hasTodo && !hasInProgress) return '';

    // Group issues by project name
    const groupedIssues = {};
    
    const addToGroup = (issues, type) => {
        if (!issues) return;
        issues.forEach(issue => {
            const projectName = issue.fields?.project?.name || 'Unknown Project';
            if (!groupedIssues[projectName]) {
                groupedIssues[projectName] = { todo: [], inProgress: [] };
            }
            groupedIssues[projectName][type].push(issue);
        });
    };

    addToGroup(todoIssues, 'todo');
    addToGroup(inProgressIssues, 'inProgress');

    const sortedProjectNames = Object.keys(groupedIssues).sort((a, b) => a.localeCompare(b));
    const today = getTodayDateString();

    let section = '';

    sortedProjectNames.forEach(projectName => {
        const projectData = groupedIssues[projectName];
        
        section += `🗂 *${escapeMarkdown(projectName)}*\n\n`;

        if (projectData.todo && projectData.todo.length > 0) {
            sortIssuesByUrgency(projectData.todo, today);
            section += `📋 ត្រូវធ្វើ:\n`;
            section += formatIssuesBlock(projectData.todo, baseUrl);
        }

        if (projectData.inProgress && projectData.inProgress.length > 0) {
            sortIssuesByUrgency(projectData.inProgress, today);
            section += `🔄 កំពុងធ្វើ:\n`;
            section += formatIssuesBlock(projectData.inProgress, baseUrl);
        }
    });

    return section;
}

module.exports = {
    getTodayDateString,
    getKhmerPriority,
    formatDueDate,
    formatPriorityAndDue,
    escapeMarkdown,
    formatCombinedTaskList
};
