/**
 * Shared Deck Configuration
 * Centralizes deck configuration across all calculators
 */

import { importDecklistBatch, importFromMoxfield } from './decklistImport.js';

// Global deck state (99-card Commander deck)
let deckState = {
    // Card types
    creatures: 30,
    instants: 10,
    sorceries: 8,
    artifacts: 8,
    enchantments: 5,
    planeswalkers: 2,
    lands: 36,
    battles: 0,

    // Actual card count (for dual-typed cards like "Artifact Creature")
    // If not set, falls back to sum of type counts
    actualCardCount: null,

    // CMC breakdown (for Wave and Vortex calculators)
    cmc0: 10,
    cmc1: 12,
    cmc2: 15,
    cmc3: 18,
    cmc4: 14,
    cmc5: 10,
    cmc6: 8,

    // Vortex-specific
    creaturesPower5Plus: 12,

    // Card-level data (new format for Vortex)
    cardDetails: [],

    // Imported card data by name (for detailed lookups)
    cardsByName: {},

    // Power 5+ creatures by CMC (for Vortex discover chains - deprecated, use cardDetails)
    power5PlusCMC3: 0,
    power5PlusCMC4: 0,
    power5PlusCMC5: 0,
    power5PlusCMC6: 0,
    power5PlusCMC7: 0,
    power5PlusCMC8: 0,
    power5PlusCMC9: 0,
    power5PlusCMC10: 0
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
 * Get imported card data
 * @returns {Object} - Imported card data including cardsByName
 */
export function getImportedCardData() {
    return {
        cardDetails: deckState.cardDetails,
        cardsByName: deckState.cardsByName
    };
}

/**
 * Get total deck size (excluding non-permanents for some calcs)
 * @param {boolean} includeNonPermanents - Whether to include instants/sorceries
 * @returns {number} - Total deck size
 */
export function getDeckSize(includeNonPermanents = true) {
    const { creatures, instants, sorceries, artifacts, enchantments, planeswalkers, lands, battles, actualCardCount } = deckState;

    // If actualCardCount is set (from import with dual-typed cards), use it
    if (actualCardCount !== null && actualCardCount !== undefined && includeNonPermanents) {
        return actualCardCount;
    }

    // Otherwise, fallback to summing type counts (for manual entry or when actualCardCount not set)
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

        // If user manually edits type counts, clear actualCardCount so it uses the sum
        const typeFields = ['creatures', 'instants', 'sorceries', 'artifacts', 'enchantments', 'planeswalkers', 'lands', 'battles'];
        if (typeFields.includes(field)) {
            deckState.actualCardCount = null;
        }

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
            // Handle arrays and objects (like cardDetails, cardsByName) directly without parsing
            if (Array.isArray(config[key]) || typeof config[key] === 'object' && config[key] !== null && !(config[key] instanceof Number)) {
                deckState[key] = config[key];
            } else {
                deckState[key] = Math.max(0, parseInt(config[key]) || 0);
            }
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

    // Bind CMC inputs (for Wave and Vortex calculators)
    const cmcFields = ['cmc0', 'cmc1', 'cmc2', 'cmc3', 'cmc4', 'cmc5', 'cmc6'];
    cmcFields.forEach(field => {
        const input = document.getElementById(`deck-${field}`);
        if (input) {
            input.value = deckState[field];
            input.addEventListener('input', (e) => {
                updateField(field, e.target.value);
            });
        }
    });

    // Bind Vortex-specific inputs
    const vortexFields = ['creaturesPower5Plus'];
    vortexFields.forEach(field => {
        const input = document.getElementById(`deck-${field}`);
        if (input) {
            input.value = deckState[field];
            input.addEventListener('input', (e) => {
                updateField(field, e.target.value);
            });
        }
    });

    // Shared UI elements
    const importStatus = document.getElementById('import-status');
    const importProgress = document.getElementById('import-progress');
    const importProgressBar = document.getElementById('import-progress-bar');
    const deckConfigPanel = document.getElementById('deck-config');

    // Helper to process successful import
    const processImportResult = (typeCounts) => {
        // Complete the progress bar
        if (importProgressBar) importProgressBar.style.width = '100%';

        console.log('Type counts received:', typeCounts);
        console.log('Card details count:', typeCounts.cardDetails?.length || 0);

        // Update deck state and UI
        updateDeck(typeCounts);

        // Update input fields
        typeFields.forEach(field => {
            const input = document.getElementById(`deck-${field}`);
            if (input) {
                input.value = typeCounts[field] || 0;
            }
        });

        updateTotalDisplay();

        // Use actualCardCount for accurate deck size (accounts for dual-typed cards)
        const totalCards = typeCounts.actualCardCount || 0;

        // Build status message with warnings
        const metadata = typeCounts.importMetadata;
        let statusMessage = `✓ Successfully imported ${totalCards} cards`;
        if (metadata && metadata.source) statusMessage += ` from ${metadata.source}`;
        if (metadata && metadata.deckName) statusMessage += ` (${metadata.deckName})`;
        statusMessage += '!';

        let warnings = [];

        if (metadata) {
            if (metadata.hasSideboard) {
                warnings.push(`Sideboard ignored (${metadata.sideboardCount} cards)`);
            }
            if (metadata.missingCardCount > 0) {
                warnings.push(`${metadata.missingCardCount} cards not found`);
            }
        }

        if (warnings.length > 0) {
            statusMessage += `<br><small style="color: #f59e0b;">⚠ ${warnings.join(' • ')}</small>`;
        }

        // Show detailed missing cards if any
        if (metadata && metadata.missingCards && metadata.missingCards.length > 0) {
            const missingList = metadata.missingCards
                .map(card => `${card.count}× ${card.name}`)
                .join(', ');
            console.warn('Missing cards:', missingList);
            statusMessage += `<br><small style="color: var(--text-dim); font-size: 0.75em;">Missing: ${missingList}</small>`;
        }

        showImportStatus(statusMessage, 'success');

        // Hide progress bar after a moment
        setTimeout(() => {
            if (importProgress) importProgress.classList.remove('visible');
        }, 800);

        // Auto-collapse the deck config panel after successful import (only if no critical issues)
        const hasMissingCards = metadata && metadata.missingCardCount > 0;
        if (deckConfigPanel && deckConfigPanel.classList.contains('expanded') && !hasMissingCards) {
            setTimeout(() => {
                deckConfigPanel.classList.remove('expanded');
                const collapseIcon = deckConfigPanel.querySelector('.collapse-icon');
                if (collapseIcon) {
                    collapseIcon.textContent = '▶';
                }
            }, 1200); 
        }
    };

    // --- Moxfield Import ---
    const moxfieldBtn = document.getElementById('moxfield-import-btn');
    const moxfieldInput = document.getElementById('moxfield-input');

    if (moxfieldBtn && moxfieldInput) {
        const runMoxfieldImport = async () => {
            const url = moxfieldInput.value.trim();
            if (!url) {
                showImportStatus('Please enter a Moxfield URL or Deck ID', 'error');
                return;
            }

            try {
                moxfieldBtn.disabled = true;
                if (importProgress) {
                    importProgress.classList.add('visible');
                    importProgressBar.style.width = '0%';
                }
                showImportStatus('Fetching from Moxfield...', 'loading');

                const typeCounts = await importFromMoxfield(url, (progress) => {
                    const percentage = progress.percentage || 0;
                    if (importProgressBar) importProgressBar.style.width = `${percentage}%`;
                    showImportStatus(
                        `${progress.currentCard} (${percentage}%)`,
                        'loading'
                    );
                });

                processImportResult(typeCounts);

            } catch (error) {
                console.error('Moxfield import error:', error);
                showImportStatus(`Error: ${error.message}`, 'error');
                if (importProgress) importProgress.classList.remove('visible');
            } finally {
                moxfieldBtn.disabled = false;
            }
        };

        moxfieldBtn.addEventListener('click', runMoxfieldImport);
        moxfieldInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') runMoxfieldImport();
        });
    }

    // --- Text Import ---
    const importBtn = document.getElementById('import-btn');
    const decklistInput = document.getElementById('decklist-input');

    if (importBtn && decklistInput) {
        importBtn.addEventListener('click', async () => {
            const decklistText = decklistInput.value.trim();

            if (!decklistText) {
                showImportStatus('Please paste a decklist first', 'error');
                return;
            }

            try {
                importBtn.disabled = true;
                if (importProgress) {
                    importProgress.classList.add('visible');
                    importProgressBar.style.width = '0%';
                }
                showImportStatus('Analyzing decklist...', 'loading');

                const typeCounts = await importDecklistBatch(decklistText, (progress) => {
                    const percentage = progress.percentage || 0;
                    if (importProgressBar) importProgressBar.style.width = `${percentage}%`;
                    showImportStatus(
                        `Processing: ${percentage}% (${progress.processed}/${progress.total} cards)`,
                        'loading'
                    );
                });

                processImportResult(typeCounts);

            } catch (error) {
                console.error('Import error:', error);
                showImportStatus(`Error: ${error.message}`, 'error');
                if (importProgress) importProgress.classList.remove('visible');
            } finally {
                importBtn.disabled = false;
            }
        });
    } else {
        console.warn('Import button elements not found - import feature disabled');
    }

    updateTotalDisplay();
}

/**
 * Show import status message
 * @param {string} message - Status message
 * @param {string} type - Status type (success, error, loading)
 */
function showImportStatus(message, type) {
    const statusEl = document.getElementById('import-status');
    if (statusEl) {
        statusEl.innerHTML = message;
        statusEl.className = `import-status ${type}`;
    }
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
