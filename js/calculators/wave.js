/**
 * Genesis Wave Calculator
 * Simulates permanents played with Genesis Wave for X
 */

import { createCache, partialShuffle, formatNumber, formatPercentage, getChartAnimationConfig } from '../utils/simulation.js';
import * as DeckConfig from '../utils/deckConfig.js';

const CONFIG = {
    ITERATIONS: 20000,
    X_RANGE_BEFORE: 4,
    X_RANGE_AFTER: 4
};

let simulationCache = createCache(50);
let lastDeckHash = '';
let chart = null;

/**
 * Create a simple hash for cmcCounts object (faster than JSON.stringify)
 * @param {Object} cmc - CMC counts object
 * @returns {string} - Hash string
 */
function hashCMC(cmc) {
    return `${cmc.cmc0}-${cmc.cmc2}-${cmc.cmc3}-${cmc.cmc4}-${cmc.cmc5}-${cmc.cmc6}-${cmc.lands}-${cmc.nonperm}`;
}

/**
 * Simulate Genesis Wave
 * @param {number} deckSize - Total cards in library
 * @param {Object} cmcCounts - Card counts by CMC bracket
 * @param {number} x - X value (cards to reveal)
 * @returns {Object} - Simulation results
 */
export function simulateGenesisWave(deckSize, cmcCounts, x) {
    const cacheKey = `${deckSize}-${x}-${hashCMC(cmcCounts)}`;
    const cached = simulationCache.get(cacheKey);
    if (cached) return cached;

    // Build deck: 0 = permanent, 1 = non-permanent
    const deck = new Uint8Array(deckSize);
    let idx = 0;

    // All permanents (lands + all CMC permanents)
    const totalPermanents = cmcCounts.lands + cmcCounts.cmc0 + cmcCounts.cmc2 +
                           cmcCounts.cmc3 + cmcCounts.cmc4 + cmcCounts.cmc5 + cmcCounts.cmc6;

    for (let i = 0; i < totalPermanents; i++) {
        deck[idx++] = 0;
    }

    // Non-permanents
    for (let i = 0; i < cmcCounts.nonperm; i++) {
        deck[idx++] = 1;
    }

    let totalPermanentsPlayed = 0;
    const drawCount = Math.min(x, deckSize);

    for (let iter = 0; iter < CONFIG.ITERATIONS; iter++) {
        // Partial Fisher-Yates
        partialShuffle(deck, drawCount, deckSize);

        // Count permanents
        let count = 0;
        for (let i = 0; i < drawCount; i++) {
            if (deck[i] === 0) {
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
 *
 * Note: Wave uses card type counts from shared config to estimate CMC distribution
 * For now, we'll use the shared type-based config and convert to CMC buckets
 */
export function getDeckConfig() {
    const config = DeckConfig.getDeckConfig();

    // For Wave, we'll use a simple mapping from card types to CMC buckets
    // This is a rough estimate - in reality users should configure CMC separately
    const cmcCounts = {
        cmc0: config.lands, // Lands are CMC 0
        cmc2: config.creatures, // Estimate creatures at CMC 2-4
        cmc3: config.instants + config.sorceries, // Spells at CMC 3
        cmc4: config.artifacts + config.enchantments, // Artifacts/enchantments at CMC 4
        cmc5: config.planeswalkers, // Planeswalkers at CMC 5+
        cmc6: config.battles, // Battles at CMC 6+
        lands: config.lands,
        nonperm: config.instants + config.sorceries
    };

    const deckSize = Object.values(cmcCounts).reduce((sum, count) => sum + count, 0);

    // Clear cache if deck changed (use hash instead of JSON.stringify for performance)
    const newHash = hashCMC(cmcCounts);
    if (newHash !== lastDeckHash) {
        simulationCache.clear();
        lastDeckHash = newHash;
    }

    const xSlider = document.getElementById('wave-xSlider');
    if (xSlider) {
        xSlider.max = Math.min(deckSize, 30);
    }

    return {
        deckSize,
        x: parseInt(document.getElementById('wave-xValue').value) || 10,
        cmcCounts
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
        const sim = simulateGenesisWave(config.deckSize, config.cmcCounts, testX);

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
        const totalPerms = config.cmcCounts.lands + config.cmcCounts.cmc0 +
                          config.cmcCounts.cmc2 + config.cmcCounts.cmc3 +
                          config.cmcCounts.cmc4 + config.cmcCounts.cmc5 +
                          config.cmcCounts.cmc6;
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
            const totalPermanents = config.cmcCounts.lands + config.cmcCounts.cmc0 +
                                   config.cmcCounts.cmc2 + config.cmcCounts.cmc3 +
                                   config.cmcCounts.cmc4 + config.cmcCounts.cmc5 +
                                   config.cmcCounts.cmc6;
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
}

/**
 * Update deck inputs from imported data
 * @param {Object} cmcCounts - CMC counts from import
 */
