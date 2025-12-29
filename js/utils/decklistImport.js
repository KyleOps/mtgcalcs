/**
 * Decklist Import and Card Type Detection
 * Uses Scryfall API to fetch card types
 */

const SCRYFALL_API = 'https://api.scryfall.com';
const RATE_LIMIT_DELAY = 100; // Scryfall requests 50-100ms between requests

// Card name corrections for common issues (typos, ambiguous names, etc.)
// Note: Don't add full double-faced names here - they're handled automatically
const CARD_NAME_CORRECTIONS = {
    'Vorinclex': 'Vorinclex, Monstrous Raider', // Disambiguate multiple printings
};

// Simple in-memory cache for card data (persists during session)
const cardCache = new Map();

/**
 * Clear the card cache (useful for testing or if data becomes stale)
 */
export function clearCardCache() {
    cardCache.clear();
    console.log('Card cache cleared');
}

/**
 * Parse decklist text into card entries
 * Supports various formats:
 * - "4 Lightning Bolt"
 * - "4x Lightning Bolt"
 * - "Lightning Bolt" (assumes 1)
 * - "1 Jace, the Mind Sculptor"
 *
 * @param {string} decklistText - Raw decklist text
 * @returns {Object} - {cards: Array, hasSideboard: boolean, sideboardCount: number}
 */
export function parseDecklistText(decklistText) {
    // Detect sideboard marker
    const sideboardIndex = decklistText.search(/^SIDEBOARD:?$/im);
    const hasSideboard = sideboardIndex >= 0;
    const maindeckText = hasSideboard ? decklistText.substring(0, sideboardIndex) : decklistText;
    const sideboardText = hasSideboard ? decklistText.substring(sideboardIndex) : '';

    // Count sideboard cards
    let sideboardCount = 0;
    if (hasSideboard) {
        const sideboardLines = sideboardText.split('\n');
        for (const line of sideboardLines) {
            const match = line.match(/^(\d+)x?\s+/);
            if (match) {
                sideboardCount += parseInt(match[1]);
            } else if (line.trim().length > 0 && !line.match(/^SIDEBOARD:?$/i)) {
                sideboardCount += 1;
            }
        }
    }

    const lines = maindeckText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const cards = [];

    for (const line of lines) {
        // Skip section headers like "Creatures:", "Lands:", "SIDEBOARD:", etc.
        if (line.match(/^(creatures?|lands?|spells?|artifacts?|enchantments?|planeswalkers?|battles?|commander|sideboard):?$/i)) {
            continue;
        }

        // Skip comment lines
        if (line.startsWith('//') || line.startsWith('#')) {
            continue;
        }

        // Match formats: "4 Card Name" or "4x Card Name"
        const match = line.match(/^(\d+)x?\s+(.+)$/);

        if (match) {
            const count = parseInt(match[1]);
            const name = match[2].trim();
            cards.push({ count, name });
        } else {
            // If no count, assume 1 copy
            if (line.length > 0) {
                cards.push({ count: 1, name: line });
            }
        }
    }

    return { cards, hasSideboard, sideboardCount };
}

/**
 * Fetch card data from Scryfall API
 * @param {string} cardName - Card name to search
 * @returns {Promise<Object|null>} - Card data or null if not found
 */
async function fetchCardData(cardName) {
    try {
        // Use fuzzy search endpoint for better matching
        const url = `${SCRYFALL_API}/cards/named?fuzzy=${encodeURIComponent(cardName)}`;
        const response = await fetch(url);

        if (!response.ok) {
            console.warn(`Card not found: ${cardName}`);
            return null;
        }

        return await response.json();
    } catch (error) {
        console.error(`Error fetching ${cardName}:`, error);
        return null;
    }
}

/**
 * Determine card type category from type line
 * @param {string} typeLine - Card type line (e.g., "Legendary Creature — Human Wizard")
 * @returns {string} - Card type category
 */
function getCardTypeCategory(typeLine) {
    const types = typeLine.toLowerCase();

    // Check types in order of precedence
    if (types.includes('creature')) return 'creatures';
    if (types.includes('planeswalker')) return 'planeswalkers';
    if (types.includes('battle')) return 'battles';
    if (types.includes('land')) return 'lands';
    if (types.includes('instant')) return 'instants';
    if (types.includes('sorcery')) return 'sorceries';
    if (types.includes('artifact')) return 'artifacts';
    if (types.includes('enchantment')) return 'enchantments';

    // Default to artifacts for unknown types
    return 'artifacts';
}

/**
 * Import and analyze a decklist
 * @param {string} decklistText - Raw decklist text
 * @param {Function} progressCallback - Called with progress updates
 * @returns {Promise<Object>} - Card type counts
 */
export async function importDecklist(decklistText, progressCallback = null) {
    const cards = parseDecklistText(decklistText);

    if (cards.length === 0) {
        throw new Error('No cards found in decklist');
    }

    const typeCounts = {
        creatures: 0,
        instants: 0,
        sorceries: 0,
        artifacts: 0,
        enchantments: 0,
        planeswalkers: 0,
        lands: 0,
        battles: 0
    };

    const totalCards = cards.length;
    let processed = 0;

    for (const { count, name } of cards) {
        // Fetch card data with rate limiting
        const cardData = await fetchCardData(name);

        if (cardData && cardData.type_line) {
            const category = getCardTypeCategory(cardData.type_line);
            typeCounts[category] += count;
        } else {
            // If card not found, try to guess from name
            console.warn(`Could not fetch ${name}, skipping`);
        }

        processed++;
        if (progressCallback) {
            progressCallback({
                processed,
                total: totalCards,
                currentCard: name,
                percentage: Math.round((processed / totalCards) * 100)
            });
        }

        // Rate limiting - wait between requests
        if (processed < totalCards) {
            await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
        }
    }

    return typeCounts;
}

/**
 * Batch fetch cards using Scryfall collection endpoint (more efficient)
 * Uses cache to avoid re-fetching previously loaded cards
 * @param {Array<string>} cardNames - Array of card names
 * @returns {Promise<Array<Object>>} - Array of card data
 */
export async function batchFetchCards(cardNames) {
    const foundCards = [];
    const cardsToFetch = [];

    // Check cache first
    for (const name of cardNames) {
        const frontFace = name.split('//')[0].trim();
        const cacheKey = frontFace.toLowerCase();

        if (cardCache.has(cacheKey)) {
            foundCards.push(cardCache.get(cacheKey));
        } else {
            cardsToFetch.push(name);
        }
    }

    if (cardsToFetch.length === 0) {
        // All cards were in cache!
        return foundCards;
    }

    // For double-faced cards, use fuzzy search instead of exact name
    // Extract just the front face name (before //)
    const identifiers = cardsToFetch.map(name => {
        // If it's a double-faced card (contains //), use front face only
        const frontFace = name.split('//')[0].trim();
        return { name: frontFace };
    });

    try {
        const response = await fetch(`${SCRYFALL_API}/cards/collection`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ identifiers })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.warn('Batch fetch failed:', errorData);
            throw new Error(errorData.details || 'Batch fetch failed');
        }

        const data = await response.json();

        // Cache and add found cards
        const fetchedCards = data.data || [];
        for (const card of fetchedCards) {
            const cacheKey = card.name.split('//')[0].trim().toLowerCase();
            cardCache.set(cacheKey, card);
            foundCards.push(card);
        }

        // Handle not_found cards - retry with fuzzy search
        const notFoundIdentifiers = data.not_found || [];

        if (notFoundIdentifiers.length > 0) {
            console.log(`Retrying ${notFoundIdentifiers.length} cards with fuzzy search...`);
            // Retry failed cards one at a time with fuzzy search (with rate limiting)
            for (const identifier of notFoundIdentifiers) {
                const fuzzyCard = await fetchCardData(identifier.name);
                if (fuzzyCard) {
                    const cacheKey = fuzzyCard.name.split('//')[0].trim().toLowerCase();
                    cardCache.set(cacheKey, fuzzyCard);
                    foundCards.push(fuzzyCard);
                }
                // Rate limit fuzzy searches
                await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
            }
        }

        return foundCards;
    } catch (error) {
        console.error('Batch fetch error:', error);
        return foundCards; // Return what we have from cache
    }
}

/**
 * Import decklist using batch API (faster for large lists)
 * @param {string} decklistText - Raw decklist text
 * @param {Function} progressCallback - Called with progress updates
 * @returns {Promise<Object>} - Card type counts with import metadata
 */
export async function importDecklistBatch(decklistText, progressCallback = null) {
    const parseResult = parseDecklistText(decklistText);
    const { cards, hasSideboard, sideboardCount } = parseResult;

    if (cards.length === 0) {
        throw new Error('No cards found in decklist');
    }

    // Create map of card names to counts (with corrections applied)
    const cardMap = new Map();
    cards.forEach(({ count, name }) => {
        // Apply name corrections if available
        const correctedName = CARD_NAME_CORRECTIONS[name] || name;

        if (cardMap.has(correctedName)) {
            cardMap.set(correctedName, cardMap.get(correctedName) + count);
        } else {
            cardMap.set(correctedName, count);
        }
    });

    const uniqueCards = Array.from(cardMap.keys());

    if (progressCallback) {
        progressCallback({
            processed: 0,
            total: uniqueCards.length,
            currentCard: 'Fetching card data...',
            percentage: 0
        });
    }

    // Batch fetch in chunks of 50 (smoother progress for typical 100-card decks)
    // Scryfall allows up to 75, but 50 gives better UX with 2 batches for 100 cards
    const BATCH_SIZE = 50;
    const allCardData = [];
    const totalBatches = Math.ceil(uniqueCards.length / BATCH_SIZE);

    for (let i = 0; i < uniqueCards.length; i += BATCH_SIZE) {
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const chunk = uniqueCards.slice(i, Math.min(i + BATCH_SIZE, uniqueCards.length));

        const chunkData = await batchFetchCards(chunk);
        allCardData.push(...chunkData);

        // Update progress after batch completes
        if (progressCallback) {
            const processedCount = Math.min(i + BATCH_SIZE, uniqueCards.length);
            progressCallback({
                processed: processedCount,
                total: uniqueCards.length,
                currentCard: `Fetched ${processedCount}/${uniqueCards.length} unique cards`,
                percentage: Math.round((processedCount / uniqueCards.length) * 100)
            });
        }

        // Rate limiting between batches (only if there are more batches)
        if (i + BATCH_SIZE < uniqueCards.length) {
            await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
        }
    }

    // Count types
    const typeCounts = {
        creatures: 0,
        instants: 0,
        sorceries: 0,
        artifacts: 0,
        enchantments: 0,
        planeswalkers: 0,
        lands: 0,
        battles: 0
    };

    // Store detailed card information for each non-land card
    const cardDetails = [];

    // Track found cards
    const foundCards = new Set();

    allCardData.forEach(cardData => {
        if (cardData && cardData.name && cardData.type_line) {
            // Try to match the card by front face name
            const frontFace = cardData.name.split('//')[0].trim();

            // Look for the card in our map by trying different name variations
            let count = 0;
            let matchedKey = null;

            // Try exact match first
            if (cardMap.has(cardData.name)) {
                count = cardMap.get(cardData.name);
                matchedKey = cardData.name;
            } else {
                // Try to find by front face name
                for (const [key, value] of cardMap.entries()) {
                    const keyFrontFace = key.split('//')[0].trim();
                    if (keyFrontFace === frontFace || key === frontFace) {
                        count = value;
                        matchedKey = key;
                        break;
                    }
                }
            }

            if (count > 0 && matchedKey) {
                // For dual-faced cards, use front face data only
                let typeLine, cmc, power;

                if (cardData.card_faces && cardData.card_faces.length > 0) {
                    // Dual-faced card - use front face (index 0)
                    const frontFace = cardData.card_faces[0];
                    typeLine = frontFace.type_line;
                    cmc = frontFace.cmc !== undefined ? frontFace.cmc : cardData.cmc;
                    power = frontFace.power;
                } else {
                    // Normal single-faced card
                    typeLine = cardData.type_line;
                    cmc = cardData.cmc;
                    power = cardData.power;
                }

                const category = getCardTypeCategory(typeLine);
                typeCounts[category] += count;
                foundCards.add(matchedKey);

                // Store detailed card info for non-lands
                if (category !== 'lands' && cmc !== undefined) {
                    const cmcValue = Math.floor(cmc);

                    // Parse power (handle *, 1+*, etc.)
                    let powerNum = null;
                    if (category === 'creatures' && power !== undefined && power !== null) {
                        if (power !== '*' && power !== '1+*' && !isNaN(parseInt(power))) {
                            powerNum = parseInt(power);
                        }
                    }

                    // Add one entry for each copy of the card
                    for (let i = 0; i < count; i++) {
                        cardDetails.push({
                            name: cardData.name,
                            cmc: cmcValue,
                            type: category,
                            power: powerNum,
                            isPower5Plus: powerNum !== null && powerNum >= 5
                        });
                    }
                }
            }
        }
    });

    // Track missing cards with details
    const missingCards = uniqueCards.filter(name => !foundCards.has(name));
    const missingCardDetails = missingCards.map(name => ({
        name,
        count: cardMap.get(name) || 0
    }));
    const missingCardCount = missingCardDetails.reduce((sum, card) => sum + card.count, 0);

    if (missingCards.length > 0) {
        console.warn('Cards not found in Scryfall:', missingCards);
        console.warn(`Missing ${missingCards.length} unique cards totaling ${missingCardCount} cards`);
    }

    // Log summary
    const totalFound = Object.values(typeCounts).reduce((sum, count) => sum + count, 0);
    const totalExpected = Array.from(cardMap.values()).reduce((sum, count) => sum + count, 0);
    console.log(`Found ${totalFound}/${totalExpected} cards (${foundCards.size}/${uniqueCards.length} unique)`);
    console.log(`Card details: ${cardDetails.length} non-land cards with full CMC/power data`);

    // Calculate summary stats from card details
    const creaturesPower5Plus = cardDetails.filter(c => c.isPower5Plus).length;
    console.log('Creatures with power 5+:', creaturesPower5Plus);

    return {
        ...typeCounts,
        cardDetails,  // Full card-level data
        creaturesPower5Plus,
        // Import metadata
        importMetadata: {
            hasSideboard,
            sideboardCount,
            missingCards: missingCardDetails,
            missingCardCount,
            totalCardsAttempted: totalExpected,
            totalCardsImported: totalFound
        }
    };
}
