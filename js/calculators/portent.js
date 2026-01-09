/**
 * Portent of Calamity Calculator
 * Simulates card type diversity for Portent of Calamity spell
 */

import { createCache, partialShuffle, formatNumber, formatPercentage, debounce } from '../utils/simulation.js';
import { renderMultiColumnTable } from '../utils/tableUtils.js';
import { createOrUpdateChart } from '../utils/chartHelpers.js';
import { bindInputSync } from '../utils/ui.js';
import * as DeckConfig from '../utils/deckConfig.js';
import { renderDistributionChart } from '../utils/sampleSimulator.js';

const CONFIG = {
    ITERATIONS: 25000,
    X_RANGE_BEFORE: 3,
    X_RANGE_AFTER: 4,
    FREE_SPELL_THRESHOLD: 4
};

let simulationCache = createCache(50);
let lastDeckHash = '';
let chart = null;

/**
 * Run Monte Carlo simulation for Portent of Calamity
 * @param {number} deckSize - Total cards in library
 * @param {Object} typeCounts - Card counts by type
 * @param {number} x - X value (cards to reveal)
 * @param {Object} cardData - Imported card data (for accurate simulation)
 * @returns {Object} - Simulation results
 */
function simulatePortent(deckSize, typeCounts, x, cardData) {
    const cacheKey = `${deckSize}-${x}`;
    const cached = simulationCache.get(cacheKey);
    if (cached) return cached;

    // IMPORTANT: Include ALL types (including land!) - Portent cares about ALL card types
    const types = Object.keys(typeCounts).filter(t => typeCounts[t] > 0);
    const typeToIndex = {};
    types.forEach((type, idx) => { typeToIndex[type] = idx; });
    const numTypes = types.length;

    // Build deck array where each card is represented as a bitmask of its types
    // This handles dual-typed cards correctly (e.g., Artifact Creature has both bits set)
    const deck = [];

    if (cardData && cardData.cardsByName && Object.keys(cardData.cardsByName).length > 0) {
        // Use actual card data for accurate simulation (INCLUDING LANDS!)
        Object.values(cardData.cardsByName).forEach(card => {
            if (card.type_line) {
                // Determine which types this card has
                let typeMask = 0;
                const cardTypes = card.type_line.toLowerCase();

                types.forEach((type, idx) => {
                    if (cardTypes.includes(type)) {
                        typeMask |= (1 << idx);
                    }
                });

                // Add this card (with its type mask) to the deck
                for (let i = 0; i < card.count; i++) {
                    deck.push(typeMask);
                }
            }
        });
    } else {
        // Fallback: assume each card is single-typed (for manual entry)
        // This includes lands too!
        types.forEach((type, typeIdx) => {
            const count = typeCounts[type];
            const typeMask = 1 << typeIdx;
            for (let i = 0; i < count; i++) {
                deck.push(typeMask);
            }
        });
    }

    const typeCountDist = new Uint32Array(numTypes + 1);
    let totalCardsToHand = 0;
    const drawCount = Math.min(x, deckSize);

    // Run simulations
    for (let iter = 0; iter < CONFIG.ITERATIONS; iter++) {
        // Partial Fisher-Yates shuffle
        partialShuffle(deck, drawCount, deckSize);

        // Count unique types from revealed cards
        let seenTypesMask = 0;
        for (let i = 0; i < drawCount; i++) {
            seenTypesMask |= deck[i];
        }

        // Count bits set in mask (number of unique types)
        let uniqueTypes = 0;
        for (let i = 0; i < numTypes; i++) {
            if (seenTypesMask & (1 << i)) {
                uniqueTypes++;
            }
        }

        typeCountDist[uniqueTypes]++;
        totalCardsToHand += uniqueTypes >= CONFIG.FREE_SPELL_THRESHOLD ? uniqueTypes - 1 : uniqueTypes;
    }

    const result = {
        typeDist: Array.from(typeCountDist).map(c => c / CONFIG.ITERATIONS),
        expectedCardsToHand: totalCardsToHand / CONFIG.ITERATIONS
    };

    simulationCache.set(cacheKey, result);
    return result;
}

/**
 * Get current deck configuration from shared config
 * @returns {Object} - Deck configuration
 */
export function getDeckConfig() {
    const config = DeckConfig.getDeckConfig();
    const cardData = DeckConfig.getImportedCardData();

    const types = {
        creature: config.creatures,
        instant: config.instants,
        sorcery: config.sorceries,
        artifact: config.artifacts,
        enchantment: config.enchantments,
        planeswalker: config.planeswalkers,
        land: config.lands,
        battle: config.battles
    };

    // Use actualCardCount if available (accounts for dual-typed cards AND already includes lands), otherwise sum
    const deckSize = config.actualCardCount !== null && config.actualCardCount !== undefined
        ? config.actualCardCount  // Already includes lands!
        : Object.values(types).reduce((sum, count) => sum + count, 0);

    // Clear cache if deck changed
    const newHash = JSON.stringify(types);
    if (newHash !== lastDeckHash) {
        simulationCache.clear();
        lastDeckHash = newHash;
    }

    const xSlider = document.getElementById('portent-xSlider');
    if (xSlider) {
        xSlider.max = Math.min(deckSize, 30);
    }

    return {
        deckSize,
        x: parseInt(document.getElementById('portent-xValue').value) || 5,
        types,
        cardData
    };
}

/**
 * Calculate probabilities for current deck configuration
 * @returns {Object} - Calculation results
 */
export function calculate() {
    const config = getDeckConfig();

    if (config.deckSize === 0) {
        return { config, results: {} };
    }

    const results = {};
    const minX = Math.max(1, config.x - CONFIG.X_RANGE_BEFORE);
    const maxX = Math.min(config.x + CONFIG.X_RANGE_AFTER, config.deckSize);

    for (let testX = minX; testX <= maxX; testX++) {
        const sim = simulatePortent(config.deckSize, config.types, testX, config.cardData);
        const typeDist = sim.typeDist;

        results[testX] = {
            expectedCards: sim.expectedCardsToHand,
            prob4Plus: typeDist.slice(CONFIG.FREE_SPELL_THRESHOLD).reduce((a, b) => a + b, 0),
            probExact4: typeDist[CONFIG.FREE_SPELL_THRESHOLD] || 0,
            prob5Plus: typeDist.slice(CONFIG.FREE_SPELL_THRESHOLD + 1).reduce((a, b) => a + b, 0),
            expectedTypes: typeDist.reduce((sum, p, i) => sum + p * i, 0),
            typeDist: typeDist
        };
    }

    return { config, results };
}

/**
 * Update chart visualization
 * @param {Object} config - Deck configuration
 * @param {Object} results - Calculation results
 */
function updateChart(config, results) {
    const xValues = Object.keys(results).map(Number).sort((a, b) => a - b);
    const prob4PlusData = xValues.map(x => results[x].prob4Plus * 100);
    const expectedTypesData = xValues.map(x => results[x].expectedTypes);

    chart = createOrUpdateChart(chart, 'portent-combinedChart', {
        type: 'line',
        data: {
            labels: xValues.map(x => 'X=' + x),
            datasets: [
                {
                    label: 'P(Free Spell) %',
                    data: prob4PlusData,
                    borderColor: '#c084fc',
                    backgroundColor: 'rgba(192, 132, 252, 0.1)',
                    fill: false,
                    tension: 0.3,
                    pointRadius: xValues.map(x => x === config.x ? 8 : 4),
                    pointBackgroundColor: xValues.map(x => x === config.x ? '#fff' : '#c084fc'),
                    yAxisID: 'yProb'
                },
                {
                    label: 'Types Exiled',
                    data: expectedTypesData,
                    borderColor: '#dc2626',
                    backgroundColor: 'rgba(220, 38, 38, 0.1)',
                    fill: false,
                    tension: 0.3,
                    pointRadius: xValues.map(x => x === config.x ? 8 : 4),
                    pointBackgroundColor: xValues.map(x => x === config.x ? '#fff' : '#dc2626'),
                    yAxisID: 'yTypes'
                }
            ]
        },
        options: {
            scales: {
                yProb: {
                    type: 'linear',
                    position: 'left',
                    beginAtZero: true,
                    max: 100,
                    title: { display: true, text: 'P(Free Spell) %', color: '#c084fc' },
                    grid: { color: 'rgba(139, 0, 0, 0.2)' },
                    ticks: { color: '#c084fc' }
                },
                yTypes: {
                    type: 'linear',
                    position: 'right',
                    beginAtZero: true,
                    title: { display: true, text: 'Types Exiled', color: '#dc2626' },
                    grid: { drawOnChartArea: false },
                    ticks: { color: '#dc2626' }
                },
                x: {
                    grid: { color: 'rgba(139, 0, 0, 0.2)' },
                    ticks: { color: '#a09090' }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            if (ctx.datasetIndex === 0) {
                                return `Free spell: ${ctx.parsed.y.toFixed(1)}%`;
                            } else {
                                return `Types exiled: ${ctx.parsed.y.toFixed(2)}`;
                            }
                        }
                    }
                }
            }
        }
    });
}

/**
 * Update comparison table
 * @param {Object} config - Deck configuration
 * @param {Object} results - Calculation results
 */
function updateTable(config, results) {
    const xValues = Object.keys(results).map(Number).sort((a, b) => a - b);
    const currentResult = results[config.x];

    const headers = ['X', 'P(Free Spell)', 'Δ Prob', 'Types Exiled', 'Δ Types'];
    
    const rows = xValues.map(x => {
        const r = results[x];
        const deltaProb = (r.prob4Plus - currentResult.prob4Plus) * 100;
        const deltaTypes = r.expectedTypes - currentResult.expectedTypes;
        const isBaseline = x === config.x;
        const probClass = deltaProb > 0.01 ? 'marginal-positive' : (deltaProb < -0.01 ? 'marginal-negative' : '');
        const typesClass = deltaTypes > 0.001 ? 'marginal-negative' : (deltaTypes < -0.001 ? 'marginal-positive' : '');

        return {
            cells: [
                x,
                formatPercentage(r.prob4Plus),
                { value: isBaseline ? '-' : (deltaProb >= 0 ? '+' : '') + deltaProb.toFixed(1) + '%', class: probClass },
                formatNumber(r.expectedTypes, 2),
                { value: isBaseline ? '-' : (deltaTypes >= 0 ? '+' : '') + formatNumber(deltaTypes, 2), class: typesClass }
            ],
            class: isBaseline ? 'current' : ''
        };
    });

    renderMultiColumnTable('portent-comparisonTable', headers, rows, { 
        highlightRowIndex: xValues.indexOf(config.x) 
    });
}

/**
 * Update stats panel with current X analysis
 * @param {Object} config - Deck configuration
 * @param {Object} results - Calculation results
 */
function updateStats(config, results) {
    const statsPanel = document.getElementById('portent-stats');
    const currentResult = results[config.x];

    if (statsPanel && currentResult) {
        // Marginal value analysis (X+1 vs X-1)
        const nextX = results[config.x + 1];
        const prevX = results[config.x - 1];

        let marginalUp = '';
        let marginalDown = '';

        if (nextX) {
            const probDiff = (nextX.prob4Plus - currentResult.prob4Plus) * 100;
            const typesDiff = nextX.expectedTypes - currentResult.expectedTypes;
            const probColor = probDiff > 0 ? '#22c55e' : '#dc2626';
            const typesColor = typesDiff > 0 ? '#dc2626' : '#22c55e';
            marginalUp = `<span style="color: ${probColor};">${probDiff >= 0 ? '+' : ''}${probDiff.toFixed(1)}%</span> free spell, <span style="color: ${typesColor};">${typesDiff >= 0 ? '+' : ''}${formatNumber(typesDiff, 2)}</span> types exiled`;
        } else {
            marginalUp = '<span style="color: var(--text-dim);">N/A</span>';
        }

        if (prevX) {
            const probDiff = (prevX.prob4Plus - currentResult.prob4Plus) * 100;
            const typesDiff = prevX.expectedTypes - currentResult.expectedTypes;
            const probColor = probDiff > 0 ? '#22c55e' : '#dc2626';
            const typesColor = typesDiff > 0 ? '#dc2626' : '#22c55e';
            marginalDown = `<span style="color: ${probColor};">${probDiff >= 0 ? '+' : ''}${probDiff.toFixed(1)}%</span> free spell, <span style="color: ${typesColor};">${typesDiff >= 0 ? '+' : ''}${formatNumber(typesDiff, 2)}</span> types exiled`;
        } else {
            marginalDown = '<span style="color: var(--text-dim);">N/A</span>';
        }

        // Calculate expected types hit
        const expectedTypes = currentResult.expectedTypes || currentResult.typeDist.reduce((sum, p, i) => sum + p * i, 0);

        // Create interpretation message
        let interpretation = '';
        if (currentResult.prob4Plus >= 0.90) {
            interpretation = `<strong style="color: #c084fc;">Excellent!</strong> Very high chance to get a free spell.`;
        } else if (currentResult.prob4Plus >= 0.75) {
            interpretation = `<strong style="color: #9333ea;">Good!</strong> Reliable free spell trigger.`;
        } else if (currentResult.prob4Plus >= 0.60) {
            interpretation = `<strong style="color: #f59e0b;">Decent.</strong> Moderate success rate.`;
        } else {
            interpretation = `<strong style="color: #dc2626;">Low probability.</strong> Consider more card type diversity.`;
        }

        interpretation += `<br><small style="color: var(--text-secondary);">Average ${formatNumber(expectedTypes, 1)} types exiled per cast</small>`;

        statsPanel.innerHTML = `
            <h3>⚡ Portent of Calamity X=${config.x} Analysis</h3>
            <div class="stats-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
                <div class="stat-card" style="background: var(--panel-bg-alt); padding: 12px; border-radius: 8px;">
                    <div style="color: var(--text-dim); font-size: 0.9em; margin-bottom: 4px;">Free Spell Chance</div>
                    <div style="font-size: 1.5em; font-weight: bold; color: #c084fc;">${formatPercentage(currentResult.prob4Plus)}</div>
                    <div style="color: var(--text-secondary); font-size: 0.85em;">4+ types revealed</div>
                </div>
                <div class="stat-card" style="background: var(--panel-bg-alt); padding: 12px; border-radius: 8px;">
                    <div style="color: var(--text-dim); font-size: 0.9em; margin-bottom: 4px;">Types Exiled</div>
                    <div style="font-size: 1.5em; font-weight: bold; color: #dc2626;">${formatNumber(expectedTypes, 1)}</div>
                    <div style="color: var(--text-secondary); font-size: 0.85em;">avg per cast (1 per type)</div>
                </div>
            </div>

            <div style="margin-top: 16px; padding: 12px; background: var(--panel-bg-alt); border-left: 3px solid var(--accent); border-radius: 4px;">
                <div style="margin-bottom: 8px;">${interpretation}</div>
                <div style="color: var(--text-secondary); font-size: 0.9em;">
                    <strong>Marginal Value:</strong><br>
                    • X=${config.x + 1}: ${marginalUp}<br>
                    • X=${config.x - 1}: ${marginalDown}
                </div>
            </div>
        `;
    }
}

/**
 * Extract types from a card using same logic as simulation
 */
function extractCardTypes(card) {
    const types = [];
    const lower = (card.type_line || '').toLowerCase();

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
 * Run sample Portent reveals and display them
 */
export function runSampleReveals() {
    const config = getDeckConfig();
    const cardData = config.cardData;

    if (!cardData || !cardData.cardsByName || Object.keys(cardData.cardsByName).length === 0) {
        document.getElementById('portent-reveals-display').innerHTML = '<p style="color: var(--text-dim);">Import a decklist to see sample reveals</p>';
        return;
    }

    // Get number of simulations from input (no cap)
    const countInput = document.getElementById('portent-sample-count');
    const numSims = Math.max(1, parseInt(countInput?.value) || 10);

    // Build deck array with full card objects
    const deck = [];
    Object.values(cardData.cardsByName).forEach(card => {
        const types = extractCardTypes(card);
        for (let i = 0; i < card.count; i++) {
            deck.push({ name: card.name, types, type_line: card.type_line });
        }
    });

    // Run simulations
    let revealsHTML = '';
    let freeSpellCount = 0;
    const typeDistribution = new Array(9).fill(0); // Track 0-8 types
    let totalTypesExiled = 0;

    for (let i = 0; i < numSims; i++) {
        // Fisher-Yates shuffle
        const shuffled = [...deck];
        for (let j = shuffled.length - 1; j > 0; j--) {
            const k = Math.floor(Math.random() * (j + 1));
            [shuffled[j], shuffled[k]] = [shuffled[k], shuffled[j]];
        }

        // Reveal X cards (same as Portent would reveal)
        const revealed = shuffled.slice(0, config.x);

        // Analyze revealed cards - count unique types
        const typesRevealed = new Set();
        revealed.forEach(card => {
            card.types.forEach(type => typesRevealed.add(type));
        });

        const numTypes = typesRevealed.size;
        const freeSpell = numTypes >= CONFIG.FREE_SPELL_THRESHOLD;
        if (freeSpell) freeSpellCount++;
        typeDistribution[numTypes]++;
        totalTypesExiled += numTypes;

        // Build HTML for this reveal
        revealsHTML += `<div class="sample-reveal ${freeSpell ? 'free-spell' : 'whiff'}">`;
        revealsHTML += `<div><strong>Reveal ${i + 1} (X=${config.x}):</strong></div>`;
        revealsHTML += '<div style="margin: 8px 0;">';

        revealed.forEach(card => {
            const primaryType = card.types[0] || 'land';
            const isDual = card.types.length > 1;
            revealsHTML += `<span class="reveal-card ${primaryType} ${isDual ? 'dual' : ''}" title="${card.type_line}">${card.name}</span>`;
        });

        revealsHTML += '</div>';
        revealsHTML += `<div class="reveal-summary ${freeSpell ? 'free-spell' : 'whiff'}">`;
        revealsHTML += `<strong>${freeSpell ? '✓ FREE SPELL!' : '✗ No free spell'}</strong> - `;
        revealsHTML += `${numTypes} type${numTypes !== 1 ? 's' : ''} exiled: `;

        // Color-code each type name
        const typeColors = {
            creature: '#22c55e',
            sorcery: '#ef4444',
            instant: '#3b82f6',
            artifact: '#a8a29e',
            enchantment: '#a855f7',
            planeswalker: '#f59e0b',
            battle: '#ec4899',
            land: '#92867d'
        };

        const sortedTypes = Array.from(typesRevealed).sort();
        revealsHTML += sortedTypes.map(type => {
            const color = typeColors[type] || '#c084fc';
            return `<span style="color: ${color}; font-weight: 600;">${type}</span>`;
        }).join(', ');

        revealsHTML += '</div></div>';
    }

    // Calculate average types exiled
    const avgTypesExiled = (totalTypesExiled / numSims).toFixed(2);

    // Build type distribution chart
    let distributionHTML = '<div style="margin-top: var(--spacing-md); padding: var(--spacing-md); background: var(--panel-bg-alt); border-radius: var(--radius-md);">';
    distributionHTML += '<h4 style="margin-top: 0;">Type Distribution:</h4>';
    
    distributionHTML += renderDistributionChart(
        typeDistribution,
        numSims,
        (count) => `${count} ${count === 1 ? 'type ' : 'types'}`,
        (count) => (count >= CONFIG.FREE_SPELL_THRESHOLD && typeDistribution[count] > 0) ? ' ← FREE SPELL' : ''
    );

    distributionHTML += `<div style="margin-top: var(--spacing-md); text-align: center;">`;
    distributionHTML += `<strong>Sample Result:</strong> ${freeSpellCount}/${numSims} reveals = ${((freeSpellCount / numSims) * 100).toFixed(1)}% chance of free spell<br>`;
    distributionHTML += `<strong>Average types exiled:</strong> ${avgTypesExiled}`;
    distributionHTML += '</div></div>';

    // Make reveals collapsible
    const revealsSectionHTML = `
        <details open style="margin-top: var(--spacing-md);">
            <summary style="cursor: pointer; padding: var(--spacing-sm); background: var(--panel-bg-alt); border-radius: var(--radius-md); font-weight: bold;">
                Show/Hide Individual Reveals (${numSims} simulations)
            </summary>
            <div style="max-height: 400px; overflow-y: auto; margin-top: var(--spacing-sm);">
                ${revealsHTML}
            </div>
        </details>
    `;

    document.getElementById('portent-reveals-display').innerHTML = distributionHTML + revealsSectionHTML;
}

/**
 * Update all UI elements
 */
export function updateUI() {
    const { config, results } = calculate();

    if (config.deckSize === 0 || Object.keys(results).length === 0) {
        if (chart) chart.destroy();
        document.getElementById('portent-comparisonTable').innerHTML = '';
        return;
    }

    updateChart(config, results);
    updateStats(config, results);
    updateTable(config, results);

    // Draw initial sample reveals if we have card data
    if (config.cardData && config.cardData.cardsByName && Object.keys(config.cardData.cardsByName).length > 0) {
        runSampleReveals();
    }
}

/**
 * Initialize Portent calculator
 */
export function init() {
    const debouncedUpdate = debounce(() => updateUI(), 150);

    // Bind X value slider and number input
    bindInputSync('portent-xSlider', 'portent-xValue', (val) => {
        debouncedUpdate();
    });

    // Bind sample reveal button
    const portentDrawRevealsBtn = document.getElementById('portent-draw-reveals-btn');
    if (portentDrawRevealsBtn) {
        portentDrawRevealsBtn.addEventListener('click', () => {
            runSampleReveals();
        });
    }

    // Listen for deck configuration changes
    DeckConfig.onDeckUpdate(() => {
        debouncedUpdate();
    });

    updateUI();
}
