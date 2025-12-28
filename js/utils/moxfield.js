/**
 * Moxfield Import Utilities
 * Handles importing deck data from Moxfield API
 */

const CORS_PROXIES = [
    'https://corsproxy.io/?',
    'https://api.allorigins.win/raw?url=',
    'https://api.codetabs.com/v1/proxy?quest='
];

/**
 * Extract deck ID from Moxfield URL or direct ID input
 * @param {string} input - URL or deck ID
 * @returns {string} - Extracted deck ID
 */
export function extractDeckId(input) {
    const urlPatterns = [
        /moxfield\.com\/decks\/([a-zA-Z0-9_-]+)/,
        /^([a-zA-Z0-9_-]{10,})$/
    ];

    for (const pattern of urlPatterns) {
        const match = input.match(pattern);
        if (match) return match[1];
    }

    return input.trim();
}

/**
 * Fetch data through CORS proxy with fallback
 * @param {string} url - Target URL
 * @param {number} proxyIndex - Current proxy index
 * @returns {Promise<Object>} - Parsed JSON response
 */
async function fetchWithProxy(url, proxyIndex = 0) {
    if (proxyIndex >= CORS_PROXIES.length) {
        throw new Error('All CORS proxies failed. Try again later.');
    }

    const proxyUrl = CORS_PROXIES[proxyIndex] + encodeURIComponent(url);

    try {
        const response = await fetch(proxyUrl);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.log(`Proxy ${proxyIndex} failed, trying next...`);
        return fetchWithProxy(url, proxyIndex + 1);
    }
}

/**
 * Parse Moxfield deck data into type and CMC counts
 * @param {Object} data - Moxfield API response
 * @returns {Object} - Parsed deck data with type and CMC counts
 */
export function parseDeckData(data) {
    const typeCounts = {
        creature: 0,
        instant: 0,
        sorcery: 0,
        artifact: 0,
        enchantment: 0,
        planeswalker: 0,
        land: 0,
        battle: 0
    };

    const cmcCounts = {
        cmc0: 0,
        cmc2: 0,
        cmc3: 0,
        cmc4: 0,
        cmc5: 0,
        cmc6: 0,
        lands: 0,
        nonperm: 0
    };

    let totalCards = 0;
    const boards = ['mainboard', 'commanders', 'companions'];

    for (const boardName of boards) {
        const board = data.boards?.[boardName];
        if (!board?.cards) continue;

        // Skip commanders - they don't count toward deck composition
        if (boardName === 'commanders') continue;

        for (const [cardKey, cardData] of Object.entries(board.cards)) {
            const quantity = cardData.quantity || 1;
            const typeLine = cardData.card?.type_line || '';
            const cmc = cardData.card?.cmc || 0;

            totalCards += quantity;

            const typeLineLower = typeLine.toLowerCase();
            const isPermanent = !typeLineLower.includes('instant') && !typeLineLower.includes('sorcery');

            // Process type counts
            if (typeLineLower.includes('creature')) {
                typeCounts.creature += quantity;
            } else if (typeLineLower.includes('planeswalker')) {
                typeCounts.planeswalker += quantity;
            } else if (typeLineLower.includes('battle')) {
                typeCounts.battle += quantity;
            } else if (typeLineLower.includes('instant')) {
                typeCounts.instant += quantity;
            } else if (typeLineLower.includes('sorcery')) {
                typeCounts.sorcery += quantity;
            } else if (typeLineLower.includes('artifact') && typeLineLower.includes('land')) {
                typeCounts.land += quantity;
            } else if (typeLineLower.includes('artifact')) {
                typeCounts.artifact += quantity;
            } else if (typeLineLower.includes('enchantment')) {
                typeCounts.enchantment += quantity;
            } else if (typeLineLower.includes('land')) {
                typeCounts.land += quantity;
            }

            // Process CMC counts for wave calculator
            if (typeLineLower.includes('land')) {
                cmcCounts.lands += quantity;
            } else if (!isPermanent) {
                cmcCounts.nonperm += quantity;
            } else if (cmc <= 1) {
                cmcCounts.cmc0 += quantity;
            } else if (cmc === 2) {
                cmcCounts.cmc2 += quantity;
            } else if (cmc === 3) {
                cmcCounts.cmc3 += quantity;
            } else if (cmc === 4) {
                cmcCounts.cmc4 += quantity;
            } else if (cmc === 5) {
                cmcCounts.cmc5 += quantity;
            } else {
                cmcCounts.cmc6 += quantity;
            }
        }
    }

    return {
        typeCounts,
        cmcCounts,
        totalCards,
        deckName: data.name || 'Unnamed Deck'
    };
}

/**
 * Import deck from Moxfield API
 * @param {string} deckId - Moxfield deck ID
 * @returns {Promise<Object>} - Parsed deck data
 */
export async function importFromMoxfield(deckId) {
    const apiUrl = `https://api2.moxfield.com/v3/decks/all/${deckId}`;
    const data = await fetchWithProxy(apiUrl);
    return parseDeckData(data);
}
