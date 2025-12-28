/**
 * Shared Deck Configuration
 * Centralizes deck configuration across all calculators
 */

// Global deck state
let deckState = {
    // Card types
    creatures: 25,
    instants: 8,
    sorceries: 6,
    artifacts: 4,
    enchantments: 3,
    planeswalkers: 2,
    lands: 32,
    battles: 0,

    // CMC breakdown (for Wave calculator)
    cmc0: 15,
    cmc2: 12,
    cmc3: 10,
    cmc4: 8,
    cmc5: 6,
    cmc6: 4
};

// Callbacks to notify calculators of changes
const updateCallbacks = [];

/**
 * Register a callback to be called when deck config changes
 * @param {Function} callback - Function to call on deck update
 */
export function onDeckUpdate(callback) {
    updateCallbacks.push(callback);
}

/**
 * Get current deck configuration
 * @returns {Object} - Current deck state
 */
export function getDeckConfig() {
    return { ...deckState };
}

/**
 * Get total deck size (excluding non-permanents for some calcs)
 * @param {boolean} includeNonPermanents - Whether to include instants/sorceries
 * @returns {number} - Total deck size
 */
export function getDeckSize(includeNonPermanents = true) {
    const { creatures, instants, sorceries, artifacts, enchantments, planeswalkers, lands, battles } = deckState;

    if (includeNonPermanents) {
        return creatures + instants + sorceries + artifacts + enchantments + planeswalkers + lands + battles;
    } else {
        return creatures + artifacts + enchantments + planeswalkers + lands + battles;
    }
}

/**
 * Update a single deck field
 * @param {string} field - Field name
 * @param {number} value - New value
 */
export function updateField(field, value) {
    if (field in deckState) {
        deckState[field] = Math.max(0, parseInt(value) || 0);
        notifyUpdates();
    }
}

/**
 * Bulk update deck configuration
 * @param {Object} config - Configuration object
 */
export function updateDeck(config) {
    Object.keys(config).forEach(key => {
        if (key in deckState) {
            deckState[key] = Math.max(0, parseInt(config[key]) || 0);
        }
    });
    notifyUpdates();
}

/**
 * Notify all registered callbacks of deck changes
 */
function notifyUpdates() {
    updateCallbacks.forEach(callback => callback(getDeckConfig()));
}

/**
 * Initialize deck configuration UI
 */
export function initDeckConfig() {
    // Bind all type inputs
    const typeFields = ['creatures', 'instants', 'sorceries', 'artifacts', 'enchantments', 'planeswalkers', 'lands', 'battles'];
    typeFields.forEach(field => {
        const input = document.getElementById(`deck-${field}`);
        if (input) {
            input.value = deckState[field];
            input.addEventListener('input', (e) => {
                updateField(field, e.target.value);
                updateTotalDisplay();
            });
        }
    });

    // Bind CMC inputs (for Wave calculator)
    const cmcFields = ['cmc0', 'cmc2', 'cmc3', 'cmc4', 'cmc5', 'cmc6'];
    cmcFields.forEach(field => {
        const input = document.getElementById(`deck-${field}`);
        if (input) {
            input.value = deckState[field];
            input.addEventListener('input', (e) => {
                updateField(field, e.target.value);
            });
        }
    });

    updateTotalDisplay();
}

/**
 * Update the total cards display
 */
function updateTotalDisplay() {
    const totalEl = document.getElementById('deck-total');
    if (totalEl) {
        totalEl.textContent = getDeckSize(true);
    }
}

/**
 * Apply a preset configuration
 * @param {Object} preset - Preset configuration
 */
export function applyPreset(preset) {
    if (preset.config) {
        // Map preset keys to deckState keys
        const mapping = {
            creature: 'creatures',
            instant: 'instants',
            sorcery: 'sorceries',
            artifact: 'artifacts',
            enchantment: 'enchantments',
            planeswalker: 'planeswalkers',
            land: 'lands',
            battle: 'battles'
        };

        Object.keys(preset.config).forEach(key => {
            const mappedKey = mapping[key] || key;
            if (mappedKey in deckState) {
                deckState[mappedKey] = preset.config[key];
                const input = document.getElementById(`deck-${mappedKey}`);
                if (input) {
                    input.value = preset.config[key];
                }
            }
        });

        updateTotalDisplay();
        notifyUpdates();
    }
}
