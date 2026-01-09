/**
 * Genesis Wave Calculator
 * Simulates permanents played with Genesis Wave for X
 */

import { createCache, partialShuffle, formatNumber, formatPercentage, getChartAnimationConfig } from '../utils/simulation.js';
import * as DeckConfig from '../utils/deckConfig.js';
import {
    buildDeckFromCardData, shuffleDeck, renderCardBadge, renderDistributionChart,
    createCollapsibleSection, extractCardTypes
} from '../utils/sampleSimulator.js';

const CONFIG = {
    ITERATIONS: 20000,
    X_RANGE_BEFORE: 4,
    X_RANGE_AFTER: 4
};

let simulationCache = createCache(50);
let lastDeckHash = '';
let chart = null;

/**
 * Create a hash for the distribution object
 * @param {Object} dist - Distribution object (CMC -> count)
 * @returns {string} - Hash string
 */
function hashDistribution(dist) {
    return Object.entries(dist)
        .sort((a, b) => {
            if (a[0] === 'nonperm') return 1;
            if (b[0] === 'nonperm') return -1;
            return Number(a[0]) - Number(b[0]);
        })
        .map(([k, v]) => `${k}:${v}`)
        .join('|');
}

/**
 * Simulate Genesis Wave
 * @param {number} deckSize - Total cards in library
 * @param {Object} distribution - Map of CMC (or 'nonperm') to count
 * @param {number} x - X value (cards to reveal)
 * @returns {Object} - Simulation results
 */
export function simulateGenesisWave(deckSize, distribution, x) {
    const cacheKey = `${deckSize}-${x}-${hashDistribution(distribution)}`;
    const cached = simulationCache.get(cacheKey);
    if (cached) return cached;

    // Build deck: each card stores its CMC (0-20), or 255 for non-permanent
    const deck = new Uint8Array(deckSize);
    let idx = 0;

    // Populate deck from distribution
    for (const [key, count] of Object.entries(distribution)) {
        const val = key === 'nonperm' ? 255 : parseInt(key);
        // Safety check for valid count
        const safeCount = Math.max(0, count || 0);
        
        for (let i = 0; i < safeCount; i++) {
            if (idx < deckSize) {
                deck[idx++] = val;
            }
        }
    }

    // IMPORTANT: If deckSize > total counts, fill remainder with 255 (Miss)
    // This prevents "phantom lands" (0s) from appearing if counts are incomplete
    while (idx < deckSize) {
        deck[idx++] = 255;
    }

    let totalPermanentsPlayed = 0;
    const drawCount = Math.min(x, deckSize);

    for (let iter = 0; iter < CONFIG.ITERATIONS; iter++) {
        // Partial Fisher-Yates
        partialShuffle(deck, drawCount, deckSize);

        // Count permanents with CMC <= X
        let count = 0;
        for (let i = 0; i < drawCount; i++) {
            const cmc = deck[i];
            if (cmc !== 255 && cmc <= x) {
                count++;
            }
        }

        totalPermanentsPlayed += count;
    }

    const result = {
        expectedPermanents: totalPermanentsPlayed / CONFIG.ITERATIONS
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

    // Use shared getDeckSize function to properly handle dual-typed cards
    const deckSize = DeckConfig.getDeckSize(true);

    // Distribution map: CMC (number) -> count, plus 'nonperm' -> count
    let distribution = {};
    
    // Also keep simple counts for stats display if needed (derived from distribution later if necessary)
    // But for simulation, we use 'distribution'

    if (cardData && cardData.cardsByName && Object.keys(cardData.cardsByName).length > 0) {
        // Use actual CMC data from imported cards
        Object.values(cardData.cardsByName).forEach(card => {
            const typeLine = card.type_line.toLowerCase();
            
            // Check if it's a permanent
            // Logic: It IS a permanent if it has permanent types.
            // It is only 'nonperm' if it is purely Instant/Sorcery (and not an Adventure/Artifact/etc)
            // However, Scryfall data and my 'isNonPermanent' logic in import might be specific.
            // Let's use the same logic as the sampler:
            const isNonPermanent = typeLine.includes('instant') || typeLine.includes('sorcery');
            // Wait, "Creature // Instant" (Adventure) has 'instant' in type_line.
            // We need to be careful.
            
            // Better logic: Check if it has a permanent type
            const isPermanent = typeLine.includes('creature') || 
                                typeLine.includes('artifact') || 
                                typeLine.includes('enchantment') || 
                                typeLine.includes('planeswalker') || 
                                typeLine.includes('battle') || 
                                typeLine.includes('land');

            if (!isPermanent) {
                distribution.nonperm = (distribution.nonperm || 0) + card.count;
            } else {
                // It is a permanent (Land, Creature, etc.)
                const cmc = card.cmc !== undefined ? Math.floor(card.cmc) : 0;
                distribution[cmc] = (distribution[cmc] || 0) + card.count;
            }
        });
        
        console.log('Genesis Wave Distribution (Imported):', distribution);

    } else {
        // Fallback to type-based estimates from manual config
        // Map the UI buckets to specific CMCs
        distribution = {
            0: config.lands + config.cmc0, // Lands are CMC 0, plus explicitly CMC 0 non-lands
            2: config.creatures, // Approximating creatures as CMC 2 (from old logic) - or config.cmc2?
            // Actually, manual config has specific CMC fields if the user used them.
            // Let's use the manual CMC buckets if they are non-zero, otherwise fallback to types
            
            // Note: The UI has inputs for 'cmc0'...'cmc6'.
            // It also has inputs for 'lands', 'creatures', etc.
            // Usually users use one or the other.
            // Let's prioritize the CMC buckets for permanents.
        };

        // Reset and rebuild based on manual config logic
        distribution = {
            0: config.lands + config.cmc0,
            2: config.cmc2,
            3: config.cmc3,
            4: config.cmc4,
            5: config.cmc5,
            6: config.cmc6, // Treats all 6+ as 6. Limitation of manual mode.
            nonperm: config.instants + config.sorceries // Or config.nonperm? No, calculated from types.
        };
        
        // If CMC buckets are all empty but types are not, maybe fall back to types? 
        // But the default values for CMC buckets are set in deckConfig.js.
    }

    // Clear cache if deck changed
    const newHash = hashDistribution(distribution);
    if (newHash !== lastDeckHash) {
        simulationCache.clear();
        lastDeckHash = newHash;
    }

    const xSlider = document.getElementById('wave-xSlider');
    if (xSlider) {
        xSlider.max = Math.min(deckSize, 30);
    }

    // Calculate total permanents for stats
    let totalPerms = 0;
    for (const [k, v] of Object.entries(distribution)) {
        if (k !== 'nonperm') totalPerms += v;
    }
    
    // Construct a compatible cmcCounts object for the view (stats panel)
    // This is just for display/logic in updateStats, not for simulation
    const cmcCounts = {
        lands: distribution[0] || 0, // Approx
        nonperm: distribution.nonperm || 0,
        // The rest aren't really needed for the stats panel logic shown previously
    };

    return {
        deckSize,
        x: parseInt(document.getElementById('wave-xValue').value) || 10,
        distribution,
        cmcCounts, // For backward compatibility with updateStats
        totalPerms,
        cardData
    };
}

/**
 * Calculate results for current deck configuration
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
        // Pass distribution instead of cmcCounts
        const sim = simulateGenesisWave(config.deckSize, config.distribution, testX);

        results[testX] = {
            expectedPermanents: sim.expectedPermanents,
            cardsRevealed: testX
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
    const expectedPermsData = xValues.map(x => results[x].expectedPermanents);
    const cardsRevealedData = xValues.map(x => results[x].cardsRevealed);

    if (!chart) {
        // First time: create chart
        chart = new Chart(document.getElementById('wave-chart'), {
            type: 'line',
            data: {
                labels: xValues.map(x => 'X=' + x),
                datasets: [
                    {
                        label: 'Expected Permanents',
                        data: expectedPermsData,
                        borderColor: '#38bdf8',
                        backgroundColor: 'rgba(56, 189, 248, 0.1)',
                        fill: false,
                        tension: 0.3,
                        pointRadius: xValues.map(x => x === config.x ? 8 : 4),
                        pointBackgroundColor: xValues.map(x => x === config.x ? '#fff' : '#38bdf8'),
                        yAxisID: 'y'
                    },
                    {
                        label: 'Cards Revealed',
                        data: cardsRevealedData,
                        borderColor: '#22c55e',
                        backgroundColor: 'rgba(34, 197, 94, 0.1)',
                        fill: false,
                        tension: 0.3,
                        pointRadius: xValues.map(x => x === config.x ? 8 : 4),
                        pointBackgroundColor: xValues.map(x => x === config.x ? '#fff' : '#22c55e'),
                        yAxisID: 'y'
                    }
                ]
            },
            options: {
                ...getChartAnimationConfig(),
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: ctx => {
                                if (ctx.datasetIndex === 0) {
                                    return `Permanents played: ${ctx.parsed.y.toFixed(2)}`;
                                } else {
                                    return `Cards revealed: ${ctx.parsed.y}`;
                                }
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        type: 'linear',
                        beginAtZero: true,
                        title: { display: true, text: 'Count', color: '#38bdf8' },
                        grid: { color: 'rgba(14, 165, 233, 0.2)' },
                        ticks: {
                            color: '#38bdf8',
                            stepSize: 1 // Whole numbers only
                        }
                    },
                    x: {
                        grid: { color: 'rgba(14, 165, 233, 0.2)' },
                        ticks: { color: '#a09090' }
                    }
                }
            }
        });
    } else {
        // Subsequent times: update data without recreating
        chart.data.labels = xValues.map(x => 'X=' + x);
        chart.data.datasets[0].data = expectedPermsData;
        chart.data.datasets[0].pointRadius = xValues.map(x => x === config.x ? 8 : 4);
        chart.data.datasets[0].pointBackgroundColor = xValues.map(x => x === config.x ? '#fff' : '#38bdf8');
        chart.data.datasets[1].data = cardsRevealedData;
        chart.data.datasets[1].pointRadius = xValues.map(x => x === config.x ? 8 : 4);
        chart.data.datasets[1].pointBackgroundColor = xValues.map(x => x === config.x ? '#fff' : '#22c55e');
        chart.update();
    }
}

/**
 * Update comparison table
 * @param {Object} config - Deck configuration
 * @param {Object} results - Calculation results
 */
function updateTable(config, results) {
    const xValues = Object.keys(results).map(Number).sort((a, b) => a - b);
    const currentResult = results[config.x];

    let tableHTML = `
        <tr>
            <th>X</th>
            <th>Cards Revealed</th>
            <th>Expected Perms</th>
            <th>Δ Perms</th>
            <th>Efficiency</th>
        </tr>
    `;

    xValues.forEach((x) => {
        const r = results[x];
        const deltaPerms = r.expectedPermanents - currentResult.expectedPermanents;
        const efficiency = (r.expectedPermanents / r.cardsRevealed) * 100;

        const rowClass = x === config.x ? 'current' : '';
        const isBaseline = x === config.x;

        const deltaClass = deltaPerms > 0.01 ? 'marginal-positive' : (deltaPerms < -0.01 ? 'marginal-negative' : '');

        tableHTML += `
            <tr class="${rowClass}">
                <td>${x}</td>
                <td>${r.cardsRevealed}</td>
                <td>${formatNumber(r.expectedPermanents)}</td>
                <td class="${deltaClass}">
                    ${isBaseline ? '-' : (deltaPerms >= 0 ? '+' : '') + formatNumber(deltaPerms)}
                </td>
                <td>${formatNumber(efficiency, 1)}%</td>
            </tr>
        `;
    });

    document.getElementById('wave-comparisonTable').innerHTML = tableHTML;
}

/**
 * Update stats panel with current X analysis
 * @param {Object} config - Deck configuration
 * @param {Object} results - Calculation results
 */
function updateStats(config, results) {
    const statsPanel = document.getElementById('wave-stats');
    const currentResult = results[config.x];

    if (statsPanel && currentResult) {
        const efficiency = (currentResult.expectedPermanents / currentResult.cardsRevealed) * 100;
        // Calculate total permanents (non-permanents are instants + sorceries)
        const totalPerms = config.deckSize - config.cmcCounts.nonperm;
        const permPercent = (totalPerms / config.deckSize) * 100;

        // Create interpretation message
        let interpretation = '';
        if (efficiency >= 70) {
            interpretation = `<strong style="color: #22c55e;">Excellent!</strong> Very efficient conversion rate.`;
        } else if (efficiency >= 60) {
            interpretation = `<strong style="color: #38bdf8;">Good!</strong> Solid permanent density.`;
        } else if (efficiency >= 50) {
            interpretation = `<strong style="color: #f59e0b;">Decent.</strong> Consider adding more permanents.`;
        } else {
            interpretation = `<strong style="color: #dc2626;">Low efficiency.</strong> Too many instants/sorceries for Wave.`;
        }

        statsPanel.innerHTML = `
            <h3>🌊 Genesis Wave X=${config.x} Analysis</h3>
            <div class="stats-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
                <div class="stat-card" style="background: var(--panel-bg-alt); padding: 12px; border-radius: 8px;">
                    <div style="color: var(--text-dim); font-size: 0.9em; margin-bottom: 4px;">Cards Revealed</div>
                    <div style="font-size: 1.5em; font-weight: bold; color: var(--text-light);">${currentResult.cardsRevealed}</div>
                    <div style="color: var(--text-secondary); font-size: 0.85em;">at X=${config.x}</div>
                </div>
                <div class="stat-card" style="background: var(--panel-bg-alt); padding: 12px; border-radius: 8px;">
                    <div style="color: var(--text-dim); font-size: 0.9em; margin-bottom: 4px;">Expected Permanents</div>
                    <div style="font-size: 1.5em; font-weight: bold; color: #38bdf8;">${formatNumber(currentResult.expectedPermanents, 1)}</div>
                    <div style="color: var(--text-secondary); font-size: 0.85em;">played for free</div>
                </div>
                <div class="stat-card" style="background: var(--panel-bg-alt); padding: 12px; border-radius: 8px;">
                    <div style="color: var(--text-dim); font-size: 0.9em; margin-bottom: 4px;">Efficiency</div>
                    <div style="font-size: 1.5em; font-weight: bold; color: #22c55e;">${formatNumber(efficiency, 1)}%</div>
                    <div style="color: var(--text-secondary); font-size: 0.85em;">hits are permanents</div>
                </div>
                <div class="stat-card" style="background: var(--panel-bg-alt); padding: 12px; border-radius: 8px;">
                    <div style="color: var(--text-dim); font-size: 0.9em; margin-bottom: 4px;">Deck Composition</div>
                    <div style="font-size: 1.5em; font-weight: bold; color: #f59e0b;">${totalPerms}</div>
                    <div style="color: var(--text-secondary); font-size: 0.85em;">${formatNumber(permPercent, 0)}% permanents</div>
                </div>
            </div>

            <div style="margin-top: 16px; padding: 12px; background: var(--panel-bg-alt); border-left: 3px solid var(--accent); border-radius: 4px;">
                <div style="margin-bottom: 8px;">${interpretation}</div>
                <div style="color: var(--text-secondary); font-size: 0.9em;">
                    • Average ${formatNumber(currentResult.expectedPermanents, 1)} permanents per cast<br>
                    • Reveals ${currentResult.cardsRevealed} cards (${formatNumber((currentResult.cardsRevealed / config.deckSize) * 100, 1)}% of deck)
                </div>
            </div>
        `;
    }
}

/**
 * Update comparison with Primal Surge
 * @param {Object} config - Deck configuration
 * @param {Object} results - Calculation results
 */
function updateComparison(config, results) {
    const comparisonPanel = document.getElementById('wave-comparison-panel');
    const comparisonInsight = document.getElementById('wave-comparison-insight');

    if (config.x >= 7) {
        // Import surge simulator to compare
        import('./surge.js').then(surgeModule => {
            // Use pre-calculated totalPerms if available, otherwise sum buckets (legacy fallback)
            const totalPermanents = config.totalPerms !== undefined 
                ? config.totalPerms 
                : (config.cmcCounts.lands + config.cmcCounts.cmc0 +
                   config.cmcCounts.cmc2 + config.cmcCounts.cmc3 +
                   config.cmcCounts.cmc4 + config.cmcCounts.cmc5 +
                   config.cmcCounts.cmc6);
                   
            const nonPermanents = config.cmcCounts.nonperm;

            const surgeResult = surgeModule.simulatePrimalSurge(config.deckSize, nonPermanents, totalPermanents);
            const waveResult = results[config.x];

            const waveBetter = waveResult.expectedPermanents > surgeResult.expectedPermanents;
            const difference = Math.abs(waveResult.expectedPermanents - surgeResult.expectedPermanents);
            const percentDiff = ((difference / surgeResult.expectedPermanents) * 100).toFixed(1);

            if (comparisonPanel) {
                comparisonPanel.style.display = 'block';
            }
            if (comparisonInsight) {
                comparisonInsight.innerHTML = `
                    <h3>Comparison at 10 Mana</h3>
                    <p>
                        <strong>Genesis Wave X=${config.x} (${config.x + 3} mana):</strong> ${formatNumber(waveResult.expectedPermanents)} expected permanents<br>
                        <strong>Primal Surge (10 mana):</strong> ${formatNumber(surgeResult.expectedPermanents)} expected permanents<br><br>
                        ${waveBetter
                            ? `<span class="marginal-positive">✓ Genesis Wave X=${config.x} is better by ${formatNumber(difference)} permanents (${percentDiff}% more)</span>`
                            : `<span class="marginal-negative">✗ Primal Surge is better by ${formatNumber(difference)} permanents (${percentDiff}% more)</span>`
                        }
                    </p>
                `;
            }
        });
    } else {
        const comparisonPanel = document.getElementById('wave-comparison-panel');
        if (comparisonPanel) {
            comparisonPanel.style.display = 'none';
        }
    }
}

/**
 * Run sample Genesis Wave simulations and display them
 */
export function runSampleReveals() {
    const config = getDeckConfig();
    const cardData = config.cardData;

    if (!cardData || !cardData.cardsByName || Object.keys(cardData.cardsByName).length === 0) {
        document.getElementById('wave-reveals-display').innerHTML = '<p style="color: var(--text-dim);">Import a decklist to see sample reveals</p>';
        return;
    }

    // Get number of simulations from input (no cap)
    const countInput = document.getElementById('wave-sample-count');
    const numSims = Math.max(1, parseInt(countInput?.value) || 10);

    // Build deck array with full card objects
    const deck = buildDeckFromCardData(cardData);

    // Run simulations
    let revealsHTML = '';
    let totalPermanents = 0;
    const permanentDistribution = new Array(config.x + 1).fill(0);

    for (let i = 0; i < numSims; i++) {
        // Shuffle deck
        const shuffled = shuffleDeck([...deck]);

        // Reveal X cards
        const revealed = shuffled.slice(0, config.x);

        // Count permanents (Genesis Wave: all permanents with CMC <= X go to battlefield)
        const permanentsToBattlefield = [];
        const permanentsToGraveyard = [];
        const nonPermanents = [];

        revealed.forEach(card => {
            // A card is a permanent if it has any permanent type, regardless of other types (e.g. Adventures are permanents)
            const hasPermanentType = card.types.some(t => 
                ['creature', 'artifact', 'enchantment', 'planeswalker', 'battle', 'land'].includes(t)
            );
            
            if (!hasPermanentType) {
                nonPermanents.push(card);
            } else {
                // Check if CMC <= X (Genesis Wave only puts permanents with CMC <= X onto battlefield)
                const cmc = card.cmc !== undefined ? card.cmc : 0;
                if (cmc <= config.x) {
                    permanentsToBattlefield.push(card);
                } else {
                    permanentsToGraveyard.push(card);
                }
            }
        });

        const permanentCount = permanentsToBattlefield.length;
        totalPermanents += permanentCount;
        permanentDistribution[permanentCount]++;

        // Build HTML for this reveal
        revealsHTML += `<div class="sample-reveal ${permanentCount > 0 ? 'free-spell' : 'whiff'}">`;
        revealsHTML += `<div><strong>Reveal ${i + 1} (X=${config.x}):</strong></div>`;
        revealsHTML += '<div style="margin: 8px 0;">';

        revealed.forEach(card => {
            const hasPermanentType = card.types.some(t => 
                ['creature', 'artifact', 'enchantment', 'planeswalker', 'battle', 'land'].includes(t)
            );
            const cmc = card.cmc !== undefined ? card.cmc : 0;
            const toBattlefield = hasPermanentType && cmc <= config.x;

            // Color coding:
            // Green background = permanent with CMC <= X (goes to battlefield)
            // Red background = permanent with CMC > X (goes to graveyard)
            // Blue background = non-permanent (goes to graveyard)
            let bgColor = '';
            let textColor = '#fff';
            if (!hasPermanentType) {
                bgColor = '#3b82f6'; // Blue for non-permanents
            } else if (cmc <= config.x) {
                bgColor = '#22c55e'; // Green for playable permanents
                textColor = '#000';
            } else {
                bgColor = '#dc2626'; // Red for high-CMC permanents
            }

            revealsHTML += `<span class="reveal-card" style="background: ${bgColor}; color: ${textColor};" title="${card.type_line} - CMC: ${cmc}">${card.name}</span>`;
        });

        revealsHTML += '</div>';
        revealsHTML += `<div class="reveal-summary">`;
        revealsHTML += `<strong>Result:</strong> ${permanentCount} permanent${permanentCount !== 1 ? 's' : ''} to battlefield`;

        const toGraveyard = nonPermanents.length + permanentsToGraveyard.length;
        if (toGraveyard > 0) {
            revealsHTML += `, ${toGraveyard} to graveyard`;
            if (permanentsToGraveyard.length > 0) {
                revealsHTML += ` (${permanentsToGraveyard.length} high-CMC permanent${permanentsToGraveyard.length !== 1 ? 's' : ''})`;
            }
        }

        revealsHTML += '</div></div>';
    }

    // Calculate average permanents
    const avgPermanents = (totalPermanents / numSims).toFixed(2);
    const avgPercent = ((avgPermanents / config.x) * 100).toFixed(1);

    // Build distribution chart
    let distributionHTML = '<div style="margin-top: var(--spacing-md); padding: var(--spacing-md); background: var(--panel-bg-alt); border-radius: var(--radius-md);">';
    distributionHTML += '<h4 style="margin-top: 0;">Permanent Distribution:</h4>';
    distributionHTML += renderDistributionChart(
        permanentDistribution,
        numSims,
        (count) => `${count.toString().padStart(2)} permanents`,
        (idx) => (idx === config.x && permanentDistribution[idx] > 0) ? ' ← 100% HITS' : ''
    );

    distributionHTML += `<div style="margin-top: var(--spacing-md); text-align: center;">`;
    distributionHTML += `<strong>Average permanents:</strong> ${avgPermanents} out of ${config.x} revealed (${avgPercent}%)`;
    distributionHTML += '</div></div>';

    // Make reveals collapsible
    const revealsSectionHTML = createCollapsibleSection(
        `Show/Hide Individual Reveals (${numSims} simulations)`,
        revealsHTML,
        true
    );

    document.getElementById('wave-reveals-display').innerHTML = distributionHTML + revealsSectionHTML;
}

/**
 * Update all UI elements
 */
export function updateUI() {
    const { config, results } = calculate();

    if (config.deckSize === 0 || Object.keys(results).length === 0) {
        if (chart) chart.destroy();
        document.getElementById('wave-comparisonTable').innerHTML = '';
        return;
    }

    updateChart(config, results);
    updateStats(config, results);
    updateTable(config, results);
    updateComparison(config, results);

    // Draw initial sample reveals if we have card data
    if (config.cardData && config.cardData.cardsByName && Object.keys(config.cardData.cardsByName).length > 0) {
        runSampleReveals();
    }
}

/**
 * Update deck inputs from imported data
 * @param {Object} cmcCounts - CMC counts from import
 */
