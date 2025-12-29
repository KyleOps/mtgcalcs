/**
 * Shared Deck Configuration
 * Centralizes deck configuration across all calculators
 */

import { importDecklistBatch } from './decklistImport.js';

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
            // Handle arrays (like cardDetails) directly without parsing
            if (Array.isArray(config[key])) {
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

    // Bind import button
    const importBtn = document.getElementById('import-btn');
    const decklistInput = document.getElementById('decklist-input');
    const importStatus = document.getElementById('import-status');
    const importProgress = document.getElementById('import-progress');
    const importProgressBar = document.getElementById('import-progress-bar');

    console.log('Import elements found:', { importBtn, decklistInput, importStatus, importProgress });

    if (importBtn && decklistInput && importStatus && importProgress && importProgressBar) {
        console.log('Binding import button click handler');
        importBtn.addEventListener('click', async () => {
            console.log('Import button clicked!');
            const decklistText = decklistInput.value.trim();
            console.log('Decklist text length:', decklistText.length);

            if (!decklistText) {
                showImportStatus('Please paste a decklist first', 'error');
                return;
            }

            try {
                importBtn.disabled = true;
                importProgress.classList.add('visible');
                importProgressBar.style.width = '0%';
                showImportStatus('Analyzing decklist...', 'loading');
                console.log('Starting import...');

                const typeCounts = await importDecklistBatch(decklistText, (progress) => {
                    console.log('Progress:', progress);
                    const percentage = progress.percentage || 0;
                    importProgressBar.style.width = `${percentage}%`;
                    showImportStatus(
                        `Processing: ${percentage}% (${progress.processed}/${progress.total} cards)`,
                        'loading'
                    );
                });

                // Complete the progress bar
                importProgressBar.style.width = '100%';

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

                // Only count actual card types (not CMC breakdown or power 5+)
                const totalCards = (typeCounts.creatures || 0) + (typeCounts.instants || 0) +
                                   (typeCounts.sorceries || 0) + (typeCounts.artifacts || 0) +
                                   (typeCounts.enchantments || 0) + (typeCounts.planeswalkers || 0) +
                                   (typeCounts.lands || 0) + (typeCounts.battles || 0);

                // Build status message with warnings
                const metadata = typeCounts.importMetadata;
                let statusMessage = `✓ Successfully imported ${totalCards} cards!`;
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
                    importProgress.classList.remove('visible');
                }, 800);

                // Auto-collapse the deck config panel after successful import (only if missing cards)
                const deckConfigPanel = document.getElementById('deck-config');
                const hasMissingCards = metadata && metadata.missingCardCount > 0;
                if (deckConfigPanel && deckConfigPanel.classList.contains('expanded') && !hasMissingCards) {
                    setTimeout(() => {
                        deckConfigPanel.classList.remove('expanded');
                        const collapseIcon = deckConfigPanel.querySelector('.collapse-icon');
                        if (collapseIcon) {
                            collapseIcon.textContent = '▶';
                        }
                    }, 1200); // Wait a bit so user sees success message
                }

                // DON'T clear the textarea - keep it so user can modify and re-import

            } catch (error) {
                console.error('Import error:', error);
                showImportStatus(`Error: ${error.message}`, 'error');
                importProgress.classList.remove('visible');
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
