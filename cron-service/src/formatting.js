function getCambodiaDateYMD(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    const year = d.toLocaleDateString('en-GB', { timeZone: 'Asia/Phnom_Penh', year: 'numeric' });
    const month = d.toLocaleDateString('en-GB', { timeZone: 'Asia/Phnom_Penh', month: '2-digit' });
    const day = d.toLocaleDateString('en-GB', { timeZone: 'Asia/Phnom_Penh', day: '2-digit' });
    return `${year}${month}${day}`;
}

function getTodayDateString(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Phnom_Penh' });
}

// Basic markdown escaper for common characters that could break parsing
function escapeMarkdown(text) {
    if (!text) return '';
    return text.toString().replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

module.exports = {
    getCambodiaDateYMD,
    getTodayDateString,
    escapeMarkdown
};
