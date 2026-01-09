/**
 * Rashmi, Eternities Crafter Calculator
 * Calculates probability of getting a free spell when casting with Rashmi
 */

import { createCache, formatNumber, formatPercentage, getChartAnimationConfig } from '../utils/simulation.js';
import * as DeckConfig from '../utils/deckConfig.js';
import {
    buildDeckFromCardData, shuffleDeck, renderCardBadge, renderDistributionChart,
    createCollapsibleSection
} from '../utils/sampleSimulator.js';

const CONFIG = {
    CMC_RANGE_BEFORE: 2,
    CMC_RANGE_AFTER: 3
};

let lastDeckHash = '';
let chart = null;
let cmcDistribution = {};
let xSpellsList = [];
let excludeXSpells = false;

/**
 * Check if a card is an X spell
 * @param {string} manaCost - Card's mana cost from Scryfall (e.g., "{X}{U}{U}")
 * @returns {boolean} - True if card has X in mana cost
 */
function isXSpell(manaCost) {
    if (!manaCost) return false;
    // Check if mana cost contains {X}
    return /\{X\}/i.test(manaCost);
}

/**
 * Run sample Rashmi reveals
 */
export function runSampleReveals() {
    const config = getDeckConfig();
    const cardData = { cardsByName: DeckConfig.getImportedCardData().cardsByName };

    if (!config.hasImportedData) {
        document.getElementById('rashmi-reveals-display').innerHTML = '<p style="color: var(--text-dim);">Import a decklist to see sample reveals</p>';
        return;
    }

    // Get number of simulations
    const countInput = document.getElementById('rashmi-sample-count');
    const numSims = Math.max(1, parseInt(countInput?.value) || 10);

    // Build deck
    const deck = buildDeckFromCardData(cardData);
    
    // Note: Rashmi triggers on the first spell you cast each turn.
    // The reveal comes from the top of the library.
    // We assume the deck is the library (minus the card being cast, technically, but for large N simulation we can just shuffle the whole deck).
    // If we want to be precise, we should remove one instance of a card with `config.castCmc` from the deck, but we don't know WHICH card was cast.
    // For now, shuffling the full deck is a sufficient approximation.

    let revealsHTML = '';
    let hitCount = 0;
    let totalFreeCMC = 0;
    const hitDistribution = new Array(2).fill(0); // 0 = Whiff, 1 = Hit

    for (let i = 0; i < numSims; i++) {
        const shuffled = shuffleDeck([...deck]);
        const revealedCard = shuffled[0]; // Top card

        // Determine if it's a hit
        const cardCmc = revealedCard.cmc || 0;
        const isX = isXSpell(revealedCard.mana_cost);
        // Rashmi specifies "nonland card", so lands are always a whiff (draw only)
        const isLand = revealedCard.types.includes('land');
        
        let isFree = false;
        let isXHit = false;

        // Check Rashmi conditions: Nonland AND CMC < Cast CMC
        if (!isLand && cardCmc < config.castCmc) {
            if (isX) {
                if (!config.excludeXSpells) {
                    isFree = true;
                    isXHit = true; // Mark as X spell hit (X=0)
                }
            } else {
                isFree = true;
            }
        }

        if (isFree) {
            hitCount++;
            hitDistribution[1]++;
            totalFreeCMC += cardCmc;
        } else {
            hitDistribution[0]++;
        }

        // HTML
        revealsHTML += `<div class="sample-reveal ${isFree ? 'free-spell' : 'whiff'}">`;
        revealsHTML += `<div><strong>Reveal ${i + 1}:</strong></div>`;
        revealsHTML += '<div style="margin: 8px 0;">';
        revealsHTML += renderCardBadge(revealedCard);
        
        if (isFree) {
            const extraInfo = isXHit ? ' (X=0)' : '';
            revealsHTML += `<span style="margin-left: 8px; color: #22c55e; font-weight: bold;">CAST FREE!${extraInfo}</span>`;
        } else {
            let reason = '';
            if (isLand) {
                reason = '(Land)';
            } else if (cardCmc >= config.castCmc) {
                reason = `(CMC ${cardCmc} too high)`;
            } else if (isX && config.excludeXSpells) {
                reason = `(X Spell excluded)`;
            }
            revealsHTML += `<span style="margin-left: 8px; color: #ef4444;">Draw card ${reason}</span>`;
        }
        
        revealsHTML += '</div></div>';
    }

    // Chart
    let distributionHTML = '<div style="margin-top: var(--spacing-md); padding: var(--spacing-md); background: var(--panel-bg-alt); border-radius: var(--radius-md);">';
    distributionHTML += '<h4 style="margin-top: 0;">Hit Rate:</h4>';
    
    // Custom mini-chart for Hit/Miss since it's binary
    const hitPct = (hitCount / numSims * 100).toFixed(1);
    const missPct = (100 - parseFloat(hitPct)).toFixed(1);
    
    distributionHTML += `<div style="display: flex; height: 24px; border-radius: 4px; overflow: hidden; margin: 12px 0;">
        <div style="width: ${hitPct}%; background: #22c55e;" title="Free Spell (${hitPct}%)"></div>
        <div style="width: ${missPct}%; background: #ef4444;" title="Draw Only (${missPct}%)"></div>
    </div>`;
    
    distributionHTML += `<div style="display: flex; justify-content: space-between; font-size: 0.9em;">
        <span style="color: #22c55e;">Free Spell: ${hitPct}%</span>
        <span style="color: #ef4444;">Draw Only: ${missPct}%</span>
    </div>`;

    if (hitCount > 0) {
        distributionHTML += `<div style="margin-top: 8px; text-align: center; font-size: 0.9em; color: var(--text-secondary);">
            Avg Free CMC: ${(totalFreeCMC / hitCount).toFixed(2)}
        </div>`;
    }

    distributionHTML += '</div>';

    const revealsSectionHTML = createCollapsibleSection(
        `Show/Hide Individual Reveals (${numSims} simulations)`,
        revealsHTML,
        true
    );

    document.getElementById('rashmi-reveals-display').innerHTML = distributionHTML + revealsSectionHTML;
}

/**
 * Calculate CMC distribution from deck
 * @param {Object} cardData - Card data from deck import
 * @param {boolean} excludeXSpells - Whether to exclude X spells
 * @returns {Object} - CMC counts and X spell info
 */
function calculateCMCDistribution(cardData, excludeXSpells = false) {
    const cmcCounts = {};
    const xSpells = [];

    if (!cardData || !cardData.cardsByName) {
        return { cmcCounts, xSpells };
    }

    // Count non-land cards by CMC
    Object.entries(cardData.cardsByName).forEach(([name, card]) => {
        if (card.type_line && !card.type_line.toLowerCase().includes('land')) {
            const cmc = card.cmc || 0;

            // Check if this is an X spell by looking at the mana cost
            const isXCard = isXSpell(card.mana_cost);

            if (isXCard) {
                xSpells.push({
                    name: card.name,
                    count: card.count,
                    cmc: cmc,
                    manaCost: card.mana_cost
                });
            }

            // Only count if not excluding X spells, or if it's not an X spell
            if (!excludeXSpells || !isXCard) {
                cmcCounts[cmc] = (cmcCounts[cmc] || 0) + card.count;
            }
        }
    });

    return { cmcCounts, xSpells };
}

/**
 * Calculate probability of free spell for a given CMC
 * @param {number} deckSize - Total cards in library
 * @param {Object} cmcCounts - Cards by CMC
 * @param {number} castCmc - CMC of spell being cast
 * @returns {Object} - Probabilities and expected value
 */
function calculateRashmiProbability(deckSize, cmcCounts, castCmc) {
    if (deckSize === 0 || castCmc === 0) {
        return {
            probFreeSpell: 0,
            probWhiff: 0,
            expectedCmc: 0,
            cmcDistribution: {}
        };
    }

    const cmcProbs = {};
    let probFreeSpell = 0;
    let expectedCmc = 0;

    // For each possible CMC, calculate probability of revealing it
    Object.entries(cmcCounts).forEach(([cmc, count]) => {
        const cmcNum = parseInt(cmc);
        const prob = count / deckSize;
        cmcProbs[cmcNum] = prob;

        // Can cast for free if revealed CMC < cast CMC
        if (cmcNum < castCmc) {
            probFreeSpell += prob;
            expectedCmc += prob * cmcNum;
        }
    });

    // Probability of whiffing (lands or CMC >= cast CMC)
    const probWhiff = 1 - probFreeSpell;

    return {
        probFreeSpell,
        probWhiff,
        expectedCmc: probFreeSpell > 0 ? expectedCmc / probFreeSpell : 0,
        cmcDistribution: cmcProbs
    };
}

/**
 * Get current deck configuration
 * @returns {Object} - Deck configuration
 */
export function getDeckConfig() {
    const config = DeckConfig.getDeckConfig();
    const cardData = DeckConfig.getImportedCardData();

    // Get exclude X spells checkbox state
    const excludeCheckbox = document.getElementById('rashmi-exclude-x');
    if (excludeCheckbox) {
        excludeXSpells = excludeCheckbox.checked;
    }

    // Calculate CMC distribution from imported cards
    const distribution = calculateCMCDistribution(cardData, excludeXSpells);
    cmcDistribution = distribution.cmcCounts;
    xSpellsList = distribution.xSpells;

    // Count total non-land cards
    const nonLandCards = Object.values(cmcDistribution).reduce((sum, count) => sum + count, 0);
    const deckSize = nonLandCards + config.lands;

    // Clear cache if deck changed
    const newHash = JSON.stringify(cmcDistribution);
    if (newHash !== lastDeckHash) {
        lastDeckHash = newHash;
    }

    const cmcSlider = document.getElementById('rashmi-cmcSlider');
    if (cmcSlider && Object.keys(cmcDistribution).length > 0) {
        const maxCmc = Math.max(...Object.keys(cmcDistribution).map(Number));
        cmcSlider.max = Math.min(maxCmc, 15);
    }

    return {
        deckSize,
        castCmc: parseInt(document.getElementById('rashmi-cmcValue').value) || 3,
        cmcDistribution,
        xSpells: xSpellsList,
        excludeXSpells,
        hasImportedData: cardData && cardData.cardsByName && Object.keys(cardData.cardsByName).length > 0
    };
}

/**
 * Calculate probabilities for current deck configuration
 * @returns {Object} - Calculation results
 */
export function calculate() {
    const config = getDeckConfig();

    if (config.deckSize === 0 || !config.hasImportedData) {
        return { config, results: {} };
    }

    const results = {};
    const minCmc = Math.max(1, config.castCmc - CONFIG.CMC_RANGE_BEFORE);
    const maxCmc = Math.min(config.castCmc + CONFIG.CMC_RANGE_AFTER, 15);

    for (let testCmc = minCmc; testCmc <= maxCmc; testCmc++) {
        results[testCmc] = calculateRashmiProbability(config.deckSize, config.cmcDistribution, testCmc);
    }

    return { config, results };
}

/**
 * Update chart visualization
 * @param {Object} config - Deck configuration
 * @param {Object} results - Calculation results
 */
function updateChart(config, results) {
    const cmcValues = Object.keys(results).map(Number).sort((a, b) => a - b);
    const probFreeSpellData = cmcValues.map(cmc => results[cmc].probFreeSpell * 100);
    const expectedCmcData = cmcValues.map(cmc => results[cmc].expectedCmc);

    if (!chart) {
        // First time: create chart
        chart = new Chart(document.getElementById('rashmi-chart'), {
            type: 'line',
            data: {
                labels: cmcValues.map(cmc => 'CMC ' + cmc),
                datasets: [
                    {
                        label: 'P(Free Spell) %',
                        data: probFreeSpellData,
                        borderColor: '#22c55e',
                        backgroundColor: 'rgba(34, 197, 94, 0.1)',
                        fill: false,
                        tension: 0.3,
                        pointRadius: cmcValues.map(cmc => cmc === config.castCmc ? 8 : 4),
                        pointBackgroundColor: cmcValues.map(cmc => cmc === config.castCmc ? '#fff' : '#22c55e'),
                        yAxisID: 'yProb'
                    },
                    {
                        label: 'Expected Free CMC',
                        data: expectedCmcData,
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        fill: false,
                        tension: 0.3,
                        pointRadius: cmcValues.map(cmc => cmc === config.castCmc ? 8 : 4),
                        pointBackgroundColor: cmcValues.map(cmc => cmc === config.castCmc ? '#fff' : '#3b82f6'),
                        yAxisID: 'yCmc'
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
                                    return `Free spell: ${ctx.parsed.y.toFixed(1)}%`;
                                } else {
                                    return `Avg free CMC: ${ctx.parsed.y.toFixed(2)}`;
                                }
                            }
                        }
                    }
                },
                scales: {
                    yProb: {
                        type: 'linear',
                        position: 'left',
                        beginAtZero: true,
                        max: 100,
                        title: { display: true, text: 'P(Free Spell) %', color: '#22c55e' },
                        grid: { color: 'rgba(139, 0, 0, 0.2)' },
                        ticks: { color: '#22c55e' }
                    },
                    yCmc: {
                        type: 'linear',
                        position: 'right',
                        beginAtZero: true,
                        title: { display: true, text: 'Expected Free CMC', color: '#3b82f6' },
                        grid: { drawOnChartArea: false },
                        ticks: { color: '#3b82f6' }
                    },
                    x: {
                        grid: { color: 'rgba(139, 0, 0, 0.2)' },
                        ticks: { color: '#a09090' }
                    }
                }
            }
        });
    } else {
        // Subsequent times: update data without recreating
        chart.data.labels = cmcValues.map(cmc => 'CMC ' + cmc);
        chart.data.datasets[0].data = probFreeSpellData;
        chart.data.datasets[0].pointRadius = cmcValues.map(cmc => cmc === config.castCmc ? 8 : 4);
        chart.data.datasets[0].pointBackgroundColor = cmcValues.map(cmc => cmc === config.castCmc ? '#fff' : '#22c55e');
        chart.data.datasets[1].data = expectedCmcData;
        chart.data.datasets[1].pointRadius = cmcValues.map(cmc => cmc === config.castCmc ? 8 : 4);
        chart.data.datasets[1].pointBackgroundColor = cmcValues.map(cmc => cmc === config.castCmc ? '#fff' : '#3b82f6');
        chart.update();
    }
}

/**
 * Update comparison table
 * @param {Object} config - Deck configuration
 * @param {Object} results - Calculation results
 */
function updateTable(config, results) {
    const cmcValues = Object.keys(results).map(Number).sort((a, b) => a - b);
    const currentResult = results[config.castCmc];

    let tableHTML = `
        <tr>
            <th>Cast CMC</th>
            <th>P(Free Spell)</th>
            <th>P(Whiff)</th>
            <th>Avg Free CMC</th>
            <th>Value Ratio</th>
        </tr>
    `;

    cmcValues.forEach((cmc) => {
        const r = results[cmc];
        const rowClass = cmc === config.castCmc ? 'current' : '';

        // Value ratio: expected free CMC / cast CMC
        const valueRatio = cmc > 0 ? r.expectedCmc / cmc : 0;
        const ratioClass = valueRatio > 0.5 ? 'marginal-positive' : (valueRatio > 0.25 ? '' : 'marginal-negative');

        tableHTML += `
            <tr class="${rowClass}">
                <td>${cmc}</td>
                <td>${formatPercentage(r.probFreeSpell)}</td>
                <td>${formatPercentage(r.probWhiff)}</td>
                <td>${formatNumber(r.expectedCmc)}</td>
                <td class="${ratioClass}">${formatNumber(valueRatio, 3)}</td>
            </tr>
        `;
    });

    document.getElementById('rashmi-comparisonTable').innerHTML = tableHTML;
}

/**
 * Update CMC distribution breakdown table
 * @param {Object} config - Deck configuration
 */
function updateCMCBreakdown(config) {
    const cmcs = Object.keys(config.cmcDistribution).map(Number).sort((a, b) => a - b);

    let breakdownHTML = '<h2>📊 Deck CMC Distribution</h2>';

    // Show X spells info if any exist
    if (config.xSpells && config.xSpells.length > 0) {
        const totalXSpells = config.xSpells.reduce((sum, spell) => sum + spell.count, 0);
        const xSpellNames = config.xSpells.map(s => {
            const manaCostDisplay = s.manaCost ? ` ${s.manaCost}` : '';
            return `${s.count}× ${s.name}${manaCostDisplay}`;
        }).join(', ');
        const statusText = config.excludeXSpells ? 'excluded from calculation' : `counted at their base CMC`;

        breakdownHTML += `
            <div style="margin-bottom: var(--spacing-md); padding: var(--spacing-md); background: rgba(6, 182, 212, 0.1); border: 1px solid rgba(6, 182, 212, 0.3); border-radius: var(--radius-md);">
                <strong style="color: var(--rashmi-primary);">⚠️ X Spells Detected (${totalXSpells} cards ${statusText}):</strong><br>
                <small style="color: var(--text-secondary); display: block; margin-top: 4px;">${xSpellNames}</small>
                <small style="color: var(--text-dim); display: block; margin-top: 4px; font-style: italic;">
                    Note: When revealed from library, X=0, so these can't be cast for free with Rashmi
                </small>
            </div>
        `;
    }

    breakdownHTML += '<div class="table-wrapper"><table class="comparison-table">';
    breakdownHTML += '<tr><th>CMC</th><th>Cards</th><th>% of Deck</th><th>Can Cast Free?</th></tr>';

    cmcs.forEach(cmc => {
        const count = config.cmcDistribution[cmc];
        const percentage = (count / config.deckSize) * 100;
        const canCast = cmc < config.castCmc;
        const canCastClass = canCast ? 'marginal-positive' : 'marginal-negative';
        const canCastText = canCast ? '✓ Yes' : '✗ No';

        // Mark rows that contain X spells
        const xSpellsAtThisCmc = config.xSpells ? config.xSpells.filter(s => s.cmc === cmc) : [];
        const hasXSpells = xSpellsAtThisCmc.length > 0 && !config.excludeXSpells;
        const rowNote = hasXSpells ? ' *' : '';
        const rowClass = hasXSpells ? 'x-spell-row' : '';

        breakdownHTML += `
            <tr class="${rowClass}">
                <td>${cmc}${rowNote}</td>
                <td>${count}</td>
                <td>${formatPercentage(count / config.deckSize)}</td>
                <td class="${canCastClass}">${canCastText}</td>
            </tr>
        `;
    });

    breakdownHTML += '</table>';

    // Add footnote if there are X spells being counted
    if (config.xSpells && config.xSpells.length > 0 && !config.excludeXSpells) {
        breakdownHTML += '<small style="color: var(--text-dim); display: block; margin-top: 4px;">* Includes X spells (can\'t be cast for free)</small>';
    }

    breakdownHTML += '</div>';
    document.getElementById('rashmi-breakdown').innerHTML = breakdownHTML;
}

/**
 * Update all UI elements
 */
export function updateUI() {
    const { config, results } = calculate();

    const importWarning = document.getElementById('rashmi-import-warning');
    const statsSection = document.getElementById('rashmi-stats');
    const breakdownSection = document.getElementById('rashmi-breakdown');

    if (!config.hasImportedData) {
        importWarning.style.display = 'block';
        statsSection.style.display = 'none';
        breakdownSection.style.display = 'none';
        if (chart) {
            chart.destroy();
            chart = null;
        }
        document.getElementById('rashmi-comparisonTable').innerHTML = '';
        return;
    }

    importWarning.style.display = 'none';
    statsSection.style.display = 'block';
    breakdownSection.style.display = 'block';

    if (config.deckSize === 0 || Object.keys(results).length === 0) {
        if (chart) chart.destroy();
        document.getElementById('rashmi-comparisonTable').innerHTML = '';
        return;
    }

    updateChart(config, results);
    updateTable(config, results);
    updateCMCBreakdown(config);

    // Run sample reveals if container exists
    if (document.getElementById('rashmi-reveals-display') && config.hasImportedData) {
        runSampleReveals();
    }
}

/**
 * Initialize Rashmi calculator
 */
export function init() {
    // Bind CMC slider and input
    const cmcSlider = document.getElementById('rashmi-cmcSlider');
    const cmcValue = document.getElementById('rashmi-cmcValue');
    const excludeCheckbox = document.getElementById('rashmi-exclude-x');

    if (cmcSlider && cmcValue) {
        cmcSlider.addEventListener('input', (e) => {
            cmcValue.value = e.target.value;
            updateUI();
        });

        cmcValue.addEventListener('input', (e) => {
            const value = parseInt(e.target.value) || 1;
            cmcSlider.value = Math.max(1, Math.min(value, 15));
            updateUI();
        });
    }

    if (excludeCheckbox) {
        excludeCheckbox.addEventListener('change', () => {
            updateUI();
        });
    }

    // Bind sample reveal button
    const revealBtn = document.getElementById('rashmi-draw-reveals-btn');
    if (revealBtn) {
        revealBtn.addEventListener('click', () => {
            runSampleReveals();
        });
    }

    // Listen for deck configuration changes
    DeckConfig.onDeckUpdate(() => {
        updateUI();
    });

    updateUI();
}
