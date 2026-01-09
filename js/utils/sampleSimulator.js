/**
 * Shared Sample Simulator Utility
 * Provides common functionality for running and displaying sample simulations
 */

/**
 * Type color mapping (consistent across all calculators)
 */
export const TYPE_COLORS = {
    creature: '#22c55e',
    sorcery: '#ef4444',
    instant: '#3b82f6',
    artifact: '#a8a29e',
    enchantment: '#a855f7',
    planeswalker: '#f59e0b',
    battle: '#ec4899',
    land: '#92867d'
};

/**
 * Extract card types from a card's type_line
 * @param {Object} card - Card object with type_line property
 * @returns {Array<string>} - Array of type names
 */
export function extractCardTypes(card) {
    const types = [];
    const lower = card.type_line.toLowerCase();

    if (lower.includes('creature')) types.push('creature');
    if (lower.includes('artifact')) types.push('artifact');
    if (lower.includes('enchantment')) types.push('enchantment');
    if (lower.includes('planeswalker')) types.push('planeswalker');
    if (lower.includes('instant')) types.push('instant');
    if (lower.includes('sorcery')) types.push('sorcery');
    if (lower.includes('battle')) types.push('battle');
    if (lower.includes('land')) types.push('land');

    return types;
}

/**
 * Build a deck array from imported card data
 * @param {Object} cardData - Imported card data
 * @returns {Array<Object>} - Deck array with card objects including CMC
 */
export function buildDeckFromCardData(cardData) {
    const deck = [];
    Object.values(cardData.cardsByName).forEach(card => {
        const types = extractCardTypes(card);
        const cmc = card.cmc !== undefined ? card.cmc : 0;

        for (let i = 0; i < card.count; i++) {
            deck.push({
                name: card.name,
                types,
                type_line: card.type_line,
                cmc: cmc,
                mana_cost: card.mana_cost || '',
                power: card.power
            });
        }
    });
    return deck;
}

/**
 * Fisher-Yates shuffle
 * @param {Array} array - Array to shuffle (modified in place)
 * @returns {Array} - Shuffled array
 */
export function shuffleDeck(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

/**
 * Render a card badge with color coding
 * @param {Object} card - Card object
 * @param {string} primaryType - Primary type for coloring
 * @returns {string} - HTML string
 */
export function renderCardBadge(card, primaryType = null) {
    if (!primaryType) {
        primaryType = card.types[0] || 'land';
    }
    const isDual = card.types.length > 1;
    return `<span class="reveal-card ${primaryType} ${isDual ? 'dual' : ''}" title="${card.type_line}">${card.name}</span>`;
}

/**
 * Render colored type names
 * @param {Array<string>} types - Array of type names
 * @returns {string} - HTML string with colored type names
 */
export function renderColoredTypes(types) {
    return types.map(type => {
        const color = TYPE_COLORS[type] || '#c084fc';
        return `<span style="color: ${color}; font-weight: 600;">${type}</span>`;
    }).join(', ');
}

/**
 * Render type distribution chart
 * @param {Array<number>} distribution - Distribution array (index = count, value = frequency)
 * @param {number} totalSims - Total simulations run
 * @param {Function} labelFn - Function to generate label for each count (e.g., "3 types")
 * @param {Function} markerFn - Function to determine if marker should be shown (e.g., free spell threshold)
 * @returns {string} - HTML string
 */
export function renderDistributionChart(distribution, totalSims, labelFn, markerFn) {
    let html = '<pre style="font-family: monospace; font-size: 0.9em; margin: 0;">';

    // Map distribution to objects with metadata
    const rows = distribution.map((count, index) => {
        const pct = (count / totalSims * 100);
        const marker = markerFn(index);
        return {
            index,
            count,
            pct,
            marker,
            label: labelFn(index)
        };
    });

    // Filter to show:
    // 1. Any row with > 0 occurrences
    // 2. Any row with a marker (even if 0 occurrences, e.g. "Max Possible")
    // 3. Always show first and last indices if range is small, but for large ranges we might skip
    let visibleRows = rows.filter(r => r.count > 0 || r.marker);

    // If we filtered out everything (e.g. 0 simulations?), show something
    if (visibleRows.length === 0 && rows.length > 0) {
        visibleRows = [rows[0]];
    }

    // If we have too many visible rows (e.g. Primal Surge spreading 0-99), we need to compress
    // Strategy: Show low end, high end, and peaks. 
    // Simple compression: If > 20 rows, show top 20 by percentage + markers + extremes
    
    let finalRows = visibleRows;
    const MAX_ROWS = 20;

    if (visibleRows.length > MAX_ROWS) {
        // Always include min and max of the visible set
        const minIndex = visibleRows[0].index;
        const maxIndex = visibleRows[visibleRows.length - 1].index;
        
        // Include rows with marker
        const markedIndices = new Set(visibleRows.filter(r => r.marker).map(r => r.index));
        
        // Include top N frequent rows
        const sortedByFreq = [...visibleRows].sort((a, b) => b.count - a.count);
        const topIndices = new Set(sortedByFreq.slice(0, 15).map(r => r.index));

        // Combine sets
        const indicesToShow = new Set([minIndex, maxIndex, ...markedIndices, ...topIndices]);
        
        // Filter and sort back to order
        finalRows = rows.filter(r => indicesToShow.has(r.index));
    }

    // Render with gaps
    let lastIndex = -1;
    finalRows.forEach(row => {
        // Check for gap
        if (lastIndex !== -1 && row.index > lastIndex + 1) {
             html += `... (${row.index - lastIndex - 1} values hidden)\n`;
        }
        
        const pctStr = row.pct.toFixed(2);
        const barLength = Math.round(row.pct / 2);
        const bar = '█'.repeat(barLength);
        
        html += `${row.label}: ${pctStr.padStart(6)}% ${bar}${row.marker}\n`;
        lastIndex = row.index;
    });

    html += '</pre>';
    return html;
}

/**
 * Create collapsible section for individual samples
 * @param {string} title - Section title
 * @param {string} content - Inner HTML content
 * @param {boolean} openByDefault - Whether section should be open initially
 * @returns {string} - HTML string
 */
export function createCollapsibleSection(title, content, openByDefault = true) {
    return `
        <details ${openByDefault ? 'open' : ''} style="margin-top: var(--spacing-md);">
            <summary style="cursor: pointer; padding: var(--spacing-sm); background: var(--panel-bg-alt); border-radius: var(--radius-md); font-weight: bold;">
                ${title}
            </summary>
            <div style="max-height: 400px; overflow-y: auto; margin-top: var(--spacing-sm);">
                ${content}
            </div>
        </details>
    `;
}
