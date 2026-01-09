/**
 * Monstrous Vortex Calculator
 * Simulates discover value from casting creatures with power 5+
 *
 * Card text: "Whenever you cast a creature spell with power 5 or greater,
 * discover X, where X is that spell's mana value."
 */

import { createCache, formatNumber, getChartAnimationConfig } from '../utils/simulation.js';
import * as DeckConfig from '../utils/deckConfig.js';
import {
    buildDeckFromCardData, shuffleDeck, renderCardBadge, renderDistributionChart,
    createCollapsibleSection
} from '../utils/sampleSimulator.js';

const CONFIG = {
    ITERATIONS: 20000,
    CMC_RANGE: [3, 4, 5, 6, 7, 8, 9, 10] // Test different CMCs for creatures cast
};

let simulationCache = createCache(50);
let lastDeckHash = '';
let chart = null;

/**
 * Run sample Discover reveals
 */
export function runSampleReveals() {
    const config = getDeckConfig();
    const cardData = { cardsByName: DeckConfig.getImportedCardData().cardsByName };

    if (!config.cardDetails || config.cardDetails.length === 0) {
        document.getElementById('vortex-reveals-display').innerHTML = '<p style="color: var(--text-dim);">Import a decklist to see sample reveals</p>';
        return;
    }

    // Get number of simulations
    const countInput = document.getElementById('vortex-sample-count');
    const numSims = Math.max(1, parseInt(countInput?.value) || 10);

    // Build deck
    const deck = buildDeckFromCardData(cardData);
    
    // Identify the card we are casting (to exclude it from deck if unique)
    // For simplicity in the visualizer, we'll just shuffle the whole deck and assume we have an infinite copy of the commander/creature in the command zone/hand
    // But strictly speaking, if we cast a unique card from hand, it's not in the library.
    // The current `simulateDiscoverForCMC` logic handles this by filtering `cardDetails`.
    // Here, let's just use the full deck for the "library" state, assuming the cast spell is already on the stack.

    let revealsHTML = '';
    let totalFreeMana = 0;
    let totalSpells = 0;
    const spellsCastDist = new Array(10).fill(0); // Track chains 0-9+

    for (let i = 0; i < numSims; i++) {
        const shuffled = shuffleDeck([...deck]);
        let currentDiscoverCMC = config.creatureCMC;
        let deckIndex = 0;
        let chainCount = 0;
        let chainMana = 0;
        let revealStepsHTML = '';
        let openDivs = 0;
        
        // Chain loop
        while (chainCount < 10 && deckIndex < shuffled.length) {
            // Reveal cards until hit
            const revealedCards = [];
            let hitCard = null;

            for (; deckIndex < shuffled.length; deckIndex++) {
                const card = shuffled[deckIndex];
                
                // Determine if land (CMC 0 and type land)
                // Note: buildDeckFromCardData sets CMC 0 for lands. 
                // We need to be careful about CMC 0 artifacts (Crypt) vs Lands.
                // card.types array helps.
                const isLand = card.types.includes('land');
                
                if (isLand) {
                    revealedCards.push({ ...card, status: 'skipped' }); // Lands skipped by discover
                    continue;
                }

                // Non-land. Check CMC.
                if (card.cmc <= currentDiscoverCMC) {
                    hitCard = card;
                    deckIndex++; // Consume this card
                    break;
                } else {
                    revealedCards.push({ ...card, status: 'skipped' }); // Too high CMC
                }
            }

            // Render this step
            revealStepsHTML += `<div style="margin-top: 8px; border-left: 2px solid var(--accent); padding-left: 8px;">`;
            openDivs++;

            revealStepsHTML += `<div style="font-size: 0.85em; color: var(--text-dim); margin-bottom: 4px;">Discover ${currentDiscoverCMC}:</div>`;
            revealStepsHTML += `<div>`;
            
            // Show skipped cards (limit to first few and last few if too many?)
            revealedCards.forEach(c => {
                 revealStepsHTML += `<span class="reveal-card dimmed" style="opacity: 0.5; transform: scale(0.9);" title="${c.name} (Skipped)">${c.name}</span>`;
            });

            if (hitCard) {
                // Determine if it chains
                // We need to know if it's a creature with power 5+
                // The card object from `buildDeckFromCardData` has `power`.
                // Check if power >= 5.
                let powerNum = -1;
                if (hitCard.power !== undefined && hitCard.power !== '*' && !isNaN(parseInt(hitCard.power))) {
                    powerNum = parseInt(hitCard.power);
                }
                
                const isCreature = hitCard.types.includes('creature');
                let isPower5Plus = false;
                if (isCreature && hitCard.power) {
                     const p = parseInt(hitCard.power);
                     if (!isNaN(p) && p >= 5) isPower5Plus = true;
                }

                const chainClass = isPower5Plus ? 'chain-trigger' : '';
                const chainIcon = isPower5Plus ? ' ⚡' : '';
                
                revealStepsHTML += renderCardBadge(hitCard);
                revealStepsHTML += `<span style="margin-left: 8px; color: ${isPower5Plus ? '#c084fc' : '#22c55e'}; font-weight: bold;">
                    ${isPower5Plus ? 'CAST & CHAIN!' : 'CAST'}
                </span>`;

                chainCount++;
                chainMana += hitCard.cmc;
                
                revealStepsHTML += `</div>`; // Close content div

                if (isPower5Plus) {
                    currentDiscoverCMC = hitCard.cmc;
                    // Prepare for next nested step
                    revealStepsHTML += `<div style="margin-left: 16px; border-left: 1px dashed rgba(255,255,255,0.1);">`;
                    openDivs++;
                } else {
                    break; // End of chain
                }

            } else {
                revealStepsHTML += `<span style="color: #ef4444;">Exiled rest of deck (Whiff)</span>`;
                revealStepsHTML += `</div>`; // Close content div
                break;
            }
        }

        // Close all open divs
        for (let k = 0; k < openDivs; k++) {
            revealStepsHTML += `</div>`;
        }

        totalSpells += chainCount;
        totalFreeMana += chainMana;
        spellsCastDist[Math.min(chainCount, 9)]++;

        // Reveal container
        const isWhiff = chainCount === 0;
        revealsHTML += `<div class="sample-reveal ${!isWhiff ? 'free-spell' : 'whiff'}" style="margin-bottom: 16px; padding: 12px; border: 1px solid var(--border-color, #333); border-radius: 8px;">`;
        revealsHTML += `<div><strong>Reveal ${i + 1}:</strong> ${chainCount} spell${chainCount !== 1 ? 's' : ''} (${chainMana} mana)</div>`;
        revealsHTML += revealStepsHTML;
        revealsHTML += `</div>`;
    }

    // Distribution Chart
    let distributionHTML = '<div style="margin-top: var(--spacing-md); padding: var(--spacing-md); background: var(--panel-bg-alt); border-radius: var(--radius-md);">';
    distributionHTML += '<h4 style="margin-top: 0;">Spells Cast Distribution:</h4>';
    
    distributionHTML += renderDistributionChart(
        spellsCastDist,
        numSims,
        (count) => `${count} ${count === 1 ? 'spell ' : 'spells'}`,
        (count) => count >= 2 ? ' ⚡ CHAIN' : ''
    );

    distributionHTML += `<div style="margin-top: var(--spacing-md); text-align: center;">`;
    distributionHTML += `<strong>Average:</strong> ${(totalSpells / numSims).toFixed(2)} spells, ${(totalFreeMana / numSims).toFixed(1)} mana per trigger`;
    distributionHTML += '</div></div>';

    const revealsSectionHTML = createCollapsibleSection(
        `Show/Hide Individual Reveals (${numSims} simulations)`,
        revealsHTML,
        true
    );

    document.getElementById('vortex-reveals-display').innerHTML = distributionHTML + revealsSectionHTML;
}

/**
 * Simulate a full discover chain using actual card data
 * Returns object with total free mana and spells cast
 *
 * @param {Array} deck - Deck array with card objects {cmc, isPower5Plus}
 * @param {number} discoverCMC - CMC to discover for (X value)
 * @param {number} offset - Starting position in deck (for chained discovers)
 * @param {number} depth - Recursion depth to prevent infinite loops
 */
function simulateDiscoverChain(deck, discoverCMC, offset = 0, depth = 0) {
    // Prevent infinite loops
    if (depth > 10 || offset >= deck.length) {
        return { totalMana: 0, spellsCast: 0, cardsExiled: 0 };
    }

    // Only shuffle on first call (depth 0)
    if (depth === 0) {
        // Fisher-Yates shuffle
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
    }

    // Reveal cards starting from offset until we find one with CMC <= discoverCMC
    for (let i = offset; i < deck.length; i++) {
        const card = deck[i];

        // Skip lands (cmc = -1)
        if (card.cmc < 0) continue;

        // Check if this card can be discovered
        if (card.cmc <= discoverCMC) {
            // Found a spell! Cast it for free
            let totalMana = card.cmc;
            let spellsCast = 1;
            let cardsExiled = i - offset + 1;

            // Check if this card can chain (is it a power 5+ creature?)
            if (card.isPower5Plus) {
                // This triggers Vortex again! Discover with new CMC
                const chainResult = simulateDiscoverChain(deck, card.cmc, i + 1, depth + 1);
                totalMana += chainResult.totalMana;
                spellsCast += chainResult.spellsCast;
                cardsExiled += chainResult.cardsExiled;
            }

            return { totalMana, spellsCast, cardsExiled };
        }
    }

    // No spell found - exiled all remaining cards
    return { totalMana: 0, spellsCast: 0, cardsExiled: deck.length - offset };
}

/**
 * Simulate discover for a given creature CMC using actual card data
 * Returns detailed stats about the discover trigger
 * @param {Array} cardDetails - Full card details array
 * @param {number} creatureCMC - CMC of the creature being cast
 * @param {number} lands - Number of lands in deck
 * @param {Object} castCreature - The creature being cast (to exclude from pool)
 */
function simulateDiscoverForCMC(cardDetails, creatureCMC, lands, castCreature = null) {
    const cacheKey = `${creatureCMC}-${cardDetails.length}-${lands}-${castCreature ? castCreature.name : 'none'}`;
    const cached = simulationCache.get(cacheKey);
    if (cached) return cached;

    // Build deck with actual card data
    const baseDeck = [];

    // Add lands (not discoverable)
    for (let i = 0; i < lands; i++) {
        baseDeck.push({ cmc: -1, isPower5Plus: false });
    }

    // Add all non-land cards from cardDetails
    // Exclude the creature being cast if it's a power 5+ creature
    let excludedCreature = false;
    cardDetails.forEach(card => {
        // Skip the first instance of the creature being cast
        if (!excludedCreature && castCreature &&
            card.name === castCreature.name &&
            card.cmc === castCreature.cmc &&
            card.isPower5Plus) {
            excludedCreature = true;
            return; // Skip this card
        }

        baseDeck.push({
            cmc: card.cmc,
            isPower5Plus: card.isPower5Plus,
            name: card.name
        });
    });

    // Run simulations
    let totalFreeMana = 0;
    let totalSpellsCast = 0;
    let totalSpellCMC = 0;
    let successfulDiscoveries = 0;
    let multiDiscoverCount = 0;

    for (let iter = 0; iter < CONFIG.ITERATIONS; iter++) {
        // Create a copy of the deck for this iteration
        const deck = [...baseDeck];
        const result = simulateDiscoverChain(deck, creatureCMC);

        if (result.spellsCast > 0) {
            successfulDiscoveries++;
            totalSpellsCast += result.spellsCast;
            totalFreeMana += result.totalMana;
            totalSpellCMC += result.totalMana / result.spellsCast;

            if (result.spellsCast > 1) {
                multiDiscoverCount++;
            }
        }
    }

    const avgSpellsPerTrigger = totalSpellsCast / CONFIG.ITERATIONS;
    const avgSpellCMC = successfulDiscoveries > 0 ? totalSpellCMC / successfulDiscoveries : 0;
    const avgFreeMana = totalFreeMana / CONFIG.ITERATIONS;

    // Count castable cards and power 5+ in range (excluding the cast creature if applicable)
    let discoverableCards = cardDetails.filter(c => c.cmc <= creatureCMC);

    // If we're casting a specific creature, exclude it from the pool
    if (castCreature && castCreature.isPower5Plus) {
        const castIndex = discoverableCards.findIndex(c =>
            c.name === castCreature.name &&
            c.cmc === castCreature.cmc &&
            c.isPower5Plus
        );
        if (castIndex !== -1) {
            discoverableCards = [
                ...discoverableCards.slice(0, castIndex),
                ...discoverableCards.slice(castIndex + 1)
            ];
        }
    }

    const castableCards = discoverableCards.length;
    const power5PlusInRange = discoverableCards.filter(c => c.isPower5Plus).length;

    const result = {
        avgSpellCMC: avgSpellCMC,
        avgFreeMana: avgFreeMana,
        avgSpellsPerTrigger: avgSpellsPerTrigger,
        multiDiscoverRate: multiDiscoverCount / CONFIG.ITERATIONS,
        successfulDiscoveries: successfulDiscoveries, // Export for hit rate calc
        castableCards: castableCards,
        power5PlusInRange: power5PlusInRange,
        discoverableCards: discoverableCards // Include the actual card list
    };

    simulationCache.set(cacheKey, result);
    return result;
}

/**
 * Get current deck configuration with card details
 */
export function getDeckConfig() {
    const config = DeckConfig.getDeckConfig();

    // Check if we have card details (new format) or need to fall back to old format
    const cardDetails = config.cardDetails || [];
    const lands = config.lands || 0;
    const creaturesPower5Plus = config.creaturesPower5Plus || 0;

    // Clear cache if deck changed
    const newHash = JSON.stringify(cardDetails) + lands;
    if (newHash !== lastDeckHash) {
        simulationCache.clear();
        lastDeckHash = newHash;
    }

    // Get current creature CMC from slider
    const creatureCMC = parseInt(document.getElementById('vortex-cmcValue')?.value) || 6;

    // Find power 5+ creatures at this CMC (these could be the creature being cast)
    const power5PlusAtCMC = cardDetails.filter(c => c.cmc === creatureCMC && c.isPower5Plus);

    // If there's exactly one power 5+ creature at this CMC, use it as the cast creature
    // Otherwise, we'll simulate as if we're casting a generic power 5+ creature at this CMC
    const castCreature = power5PlusAtCMC.length > 0 ? power5PlusAtCMC[0] : null;

    return {
        cardDetails,
        lands,
        creaturesPower5Plus,
        creatureCMC,
        castCreature,
        power5PlusAtCMC, // All power 5+ creatures at this CMC
        deckSize: cardDetails.length + lands
    };
}

/**
 * Calculate results for different creature CMCs
 */
export function calculate() {
    const config = getDeckConfig();

    if (config.deckSize === 0 || config.creaturesPower5Plus === 0 || config.cardDetails.length === 0) {
        return { config, results: {} };
    }

    const results = {};

    // Calculate for each CMC in range
    CONFIG.CMC_RANGE.forEach(cmc => {
        // Find if there's a power 5+ creature at this CMC to exclude from the pool
        const power5PlusAtThisCMC = config.cardDetails.filter(c => c.cmc === cmc && c.isPower5Plus);
        const creatureToExclude = power5PlusAtThisCMC.length > 0 ? power5PlusAtThisCMC[0] : null;

        const stats = simulateDiscoverForCMC(config.cardDetails, cmc, config.lands, creatureToExclude);
        results[cmc] = {
            creatureCMC: cmc,
            ...stats
        };
    });

    return { config, results };
}

/**
 * Update chart visualization
 */
function updateChart(config, results) {
    const cmcValues = CONFIG.CMC_RANGE;
    const freeManaData = cmcValues.map(cmc => results[cmc]?.avgFreeMana || 0);
    const avgSpellCMCData = cmcValues.map(cmc => results[cmc]?.avgSpellCMC || 0);
    const avgSpellsCastData = cmcValues.map(cmc => results[cmc]?.avgSpellsPerTrigger || 0);

    if (!chart) {
        // First time: create chart
        chart = new Chart(document.getElementById('vortex-chart'), {
            type: 'line',
            data: {
                labels: cmcValues.map(cmc => `${cmc} CMC`),
                datasets: [
                    {
                        label: 'Avg Free Mana Value',
                        data: freeManaData,
                        borderColor: '#f97316',
                        backgroundColor: 'rgba(249, 115, 22, 0.1)',
                        fill: false,
                        tension: 0.3,
                        pointRadius: cmcValues.map(cmc => cmc === config.creatureCMC ? 8 : 4),
                        pointBackgroundColor: cmcValues.map(cmc => cmc === config.creatureCMC ? '#fff' : '#f97316'),
                        yAxisID: 'yMana'
                    },
                    {
                        label: 'Avg Spell CMC Found',
                        data: avgSpellCMCData,
                        borderColor: '#22c55e',
                        backgroundColor: 'rgba(34, 197, 94, 0.1)',
                        fill: false,
                        tension: 0.3,
                        pointRadius: cmcValues.map(cmc => cmc === config.creatureCMC ? 8 : 4),
                        pointBackgroundColor: cmcValues.map(cmc => cmc === config.creatureCMC ? '#fff' : '#22c55e'),
                        yAxisID: 'yMana'
                    },
                    {
                        label: 'Avg Spells Cast',
                        data: avgSpellsCastData,
                        borderColor: '#c084fc',
                        backgroundColor: 'rgba(192, 132, 252, 0.1)',
                        fill: false,
                        tension: 0.3,
                        pointRadius: cmcValues.map(cmc => cmc === config.creatureCMC ? 8 : 4),
                        pointBackgroundColor: cmcValues.map(cmc => cmc === config.creatureCMC ? '#fff' : '#c084fc'),
                        yAxisID: 'ySpells'
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
                                    return `Free mana: ${ctx.parsed.y.toFixed(2)} avg`;
                                } else if (ctx.datasetIndex === 1) {
                                    return `Spell CMC: ${ctx.parsed.y.toFixed(2)} avg`;
                                } else {
                                    return `Spells cast: ${ctx.parsed.y.toFixed(2)} avg`;
                                }
                            }
                        }
                    }
                },
                scales: {
                    yMana: {
                        type: 'linear',
                        position: 'left',
                        beginAtZero: true,
                        title: { display: true, text: 'Mana Value', color: '#f97316' },
                        grid: { color: 'rgba(249, 115, 22, 0.2)' },
                        ticks: { color: '#f97316' }
                    },
                    ySpells: {
                        type: 'linear',
                        position: 'right',
                        beginAtZero: true,
                        max: 3,
                        title: { display: true, text: 'Spells Cast', color: '#c084fc' },
                        grid: { display: false },
                        ticks: { color: '#c084fc' }
                    },
                    x: {
                        grid: { color: 'rgba(249, 115, 22, 0.2)' },
                        ticks: { color: '#a09090' }
                    }
                }
            }
        });
    } else {
        // Subsequent times: update data without recreating
        chart.data.labels = cmcValues.map(cmc => `${cmc} CMC`);
        chart.data.datasets[0].data = freeManaData;
        chart.data.datasets[0].pointRadius = cmcValues.map(cmc => cmc === config.creatureCMC ? 8 : 4);
        chart.data.datasets[0].pointBackgroundColor = cmcValues.map(cmc => cmc === config.creatureCMC ? '#fff' : '#f97316');
        chart.data.datasets[1].data = avgSpellCMCData;
        chart.data.datasets[1].pointRadius = cmcValues.map(cmc => cmc === config.creatureCMC ? 8 : 4);
        chart.data.datasets[1].pointBackgroundColor = cmcValues.map(cmc => cmc === config.creatureCMC ? '#fff' : '#22c55e');
        chart.data.datasets[2].data = avgSpellsCastData;
        chart.data.datasets[2].pointRadius = cmcValues.map(cmc => cmc === config.creatureCMC ? 8 : 4);
        chart.data.datasets[2].pointBackgroundColor = cmcValues.map(cmc => cmc === config.creatureCMC ? '#fff' : '#c084fc');
        chart.update();
    }
}

/**
 * Update comparison table
 */
function updateTable(config, results) {
    const cmcValues = CONFIG.CMC_RANGE;
    const currentResult = results[config.creatureCMC];

    let tableHTML = `
        <tr>
            <th>Creature CMC</th>
            <th>Castable Cards</th>
            <th>Avg Spell CMC</th>
            <th>Avg Free Mana</th>
        </tr>
    `;

    cmcValues.forEach((cmc) => {
        const r = results[cmc];
        if (!r) return;

        const rowClass = cmc === config.creatureCMC ? 'current' : '';

        tableHTML += `
            <tr class="${rowClass}">
                <td>${cmc}</td>
                <td>${r.castableCards}</td>
                <td>${formatNumber(r.avgSpellCMC, 2)}</td>
                <td>${formatNumber(r.avgFreeMana, 2)}</td>
            </tr>
        `;
    });

    document.getElementById('vortex-comparisonTable').innerHTML = tableHTML;
}

/**
 * Update stats panel
 */
function updateStats(config, results) {
    const statsPanel = document.getElementById('vortex-stats');
    const currentResult = results[config.creatureCMC];

    if (statsPanel && currentResult) {
        const totalNonLands = config.cardDetails.length;
        const castablePercent = totalNonLands > 0 ? (currentResult.castableCards / totalNonLands) * 100 : 0;
        const hitRate = currentResult.successfulDiscoveries / CONFIG.ITERATIONS;

        // Build detailed breakdown with actual card names
        const discoverableCards = currentResult.discoverableCards || [];

        // Group by CMC
        const cmcGroups = {};
        discoverableCards.forEach(card => {
            if (!cmcGroups[card.cmc]) {
                cmcGroups[card.cmc] = [];
            }
            cmcGroups[card.cmc].push(card);
        });

        // Build breakdown HTML
        let castableCMCBreakdown = '';
        if (Object.keys(cmcGroups).length > 0) {
            const cmcSections = [];
            Object.keys(cmcGroups).sort((a, b) => Number(a) - Number(b)).forEach(cmc => {
                const cards = cmcGroups[cmc];
                const power5Plus = cards.filter(c => c.isPower5Plus);
                const regularCards = cards.filter(c => !c.isPower5Plus);

                let section = `<strong>${cmc} CMC (${cards.length} cards)</strong>:`;

                if (power5Plus.length > 0) {
                    const names = power5Plus.map(c => c.name).join(', ');
                    section += `<br>&nbsp;&nbsp;⚡ <span style="color: #c084fc;">Chain: ${names}</span>`;
                }

                if (regularCards.length > 0) {
                    const names = regularCards.map(c => c.name).join(', ');
                    section += `<br>&nbsp;&nbsp;• ${names}`;
                }

                cmcSections.push(section);
            });

            castableCMCBreakdown = `<br><div style="margin-top: 8px; padding-left: 8px; line-height: 1.6;">${cmcSections.join('<br>')}</div>`;
        }

        // Create interpretation message
        let interpretation = '';
        if (currentResult.avgSpellsPerTrigger >= 1.3) {
            interpretation = `<strong style="color: #22c55e;">Excellent!</strong> You're chaining frequently and getting great value.`;
        } else if (currentResult.avgSpellsPerTrigger >= 1.15) {
            interpretation = `<strong style="color: #38bdf8;">Good!</strong> Solid discover value with occasional chains.`;
        } else if (currentResult.avgSpellsPerTrigger >= 1.05) {
            interpretation = `<strong style="color: #f59e0b;">Decent.</strong> Getting some value but chains are rare.`;
        } else {
            interpretation = `<strong style="color: #dc2626;">Low value.</strong> Consider adding more low-cost spells or higher CMC creatures.`;
        }

        // Use the power5PlusInRange from the result
        const power5PlusInRange = currentResult.power5PlusInRange || 0;
        const chainablePercent = currentResult.castableCards > 0
            ? (power5PlusInRange / currentResult.castableCards) * 100
            : 0;

        // Check if we're excluding a creature from the pool
        const excludedCreatureNote = config.power5PlusAtCMC && config.power5PlusAtCMC.length > 0
            ? `<div style="margin-bottom: 12px; padding: 8px; background: rgba(192, 132, 252, 0.1); border-left: 3px solid #c084fc; border-radius: 4px; font-size: 0.9em;">
                ⚡ Casting <strong>${config.power5PlusAtCMC[0].name}</strong> - excluded from discover pool
               </div>`
            : '';

        statsPanel.innerHTML = `
            <h3>🌀 Discover ${config.creatureCMC} Analysis</h3>
            ${excludedCreatureNote}
            
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 16px;">
                 <div class="stat-card" style="background: var(--panel-bg-alt); padding: 12px; border-radius: 8px; text-align: center;">
                    <div style="color: var(--text-dim); font-size: 0.85em; text-transform: uppercase; letter-spacing: 0.5px;">Avg Spells</div>
                    <div style="font-size: 1.8em; font-weight: bold; color: var(--text-light); line-height: 1.2;">${formatNumber(currentResult.avgSpellsPerTrigger, 2)}</div>
                    <div style="color: var(--text-secondary); font-size: 0.8em;">per trigger</div>
                </div>
                 <div class="stat-card" style="background: var(--panel-bg-alt); padding: 12px; border-radius: 8px; text-align: center;">
                    <div style="color: var(--text-dim); font-size: 0.85em; text-transform: uppercase; letter-spacing: 0.5px;">Avg Mana</div>
                    <div style="font-size: 1.8em; font-weight: bold; color: #f97316; line-height: 1.2;">${formatNumber(currentResult.avgFreeMana, 1)}</div>
                    <div style="color: var(--text-secondary); font-size: 0.8em;">value per trigger</div>
                </div>
                 <div class="stat-card" style="background: var(--panel-bg-alt); padding: 12px; border-radius: 8px; text-align: center; border: 1px solid rgba(34, 197, 94, 0.2);">
                    <div style="color: var(--text-dim); font-size: 0.85em; text-transform: uppercase; letter-spacing: 0.5px;">Chain Probability</div>
                    <div style="font-size: 1.8em; font-weight: bold; color: #22c55e; line-height: 1.2;">${formatNumber(currentResult.multiDiscoverRate * 100, 1)}%</div>
                    <div style="color: var(--text-secondary); font-size: 0.8em;">chance of >1 spell</div>
                </div>
            </div>

            <div style="background: rgba(0,0,0,0.2); border-radius: 8px; padding: 12px; margin-bottom: 16px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px;">
                     <span style="color: var(--text-dim);">Discover Pool Size</span>
                     <strong>${currentResult.castableCards} cards <span style="font-weight: normal; color: var(--text-secondary); font-size: 0.9em;">(${formatNumber(castablePercent, 0)}% of non-lands)</span></strong>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px;" title="Percentage of discoverable cards that will trigger another discover">
                     <span style="color: var(--text-dim);">Chain Density (Pool)</span>
                     <strong style="color: #c084fc;">${formatNumber(chainablePercent, 1)}% <span style="font-weight: normal; color: var(--text-secondary); font-size: 0.9em;">(${power5PlusInRange} cards)</span></strong>
                </div>
                 <div style="display: flex; justify-content: space-between;" title="Probability of finding ANY valid card (not whiffing)">
                     <span style="color: var(--text-dim);">Hit Probability</span>
                     <strong>${formatNumber(hitRate * 100, 1)}%</strong>
                </div>
            </div>

            <div style="margin-top: 16px; padding: 12px; background: var(--panel-bg-alt); border-left: 3px solid var(--accent); border-radius: 4px;">
                <div style="margin-bottom: 8px;">${interpretation}</div>
                <div style="color: var(--text-secondary); font-size: 0.9em;">
                    • Average discovered spell costs ${formatNumber(currentResult.avgSpellCMC, 1)} mana<br>
                </div>
            </div>

            <details style="margin-top: 12px; color: var(--text-dim); font-size: 0.85em;">
                <summary style="cursor: pointer; user-select: none;">📊 Discover pool breakdown (${currentResult.castableCards} cards)</summary>
                <div style="margin-top: 8px; padding-left: 8px;">
                    ${castableCMCBreakdown || 'No castable spells'}<br>
                    <strong style="color: var(--text-light);">${power5PlusInRange} of these can chain</strong> (power 5+ creatures)
                </div>
            </details>
        `;
    }
}

/**
 * Update all UI elements
 */
export function updateUI() {
    const { config, results } = calculate();

    console.log('Vortex updateUI called:', {
        deckSize: config.deckSize,
        cardDetailsLength: config.cardDetails?.length,
        creaturesPower5Plus: config.creaturesPower5Plus,
        resultsCount: Object.keys(results).length
    });

    // Show/hide import warning based on whether we have card details
    const importWarning = document.getElementById('vortex-import-warning');
    if (importWarning) {
        if (config.cardDetails.length > 0) {
            importWarning.style.display = 'none';
        } else {
            importWarning.style.display = 'block';
        }
    }

    if (config.cardDetails.length === 0 || config.creaturesPower5Plus === 0 || Object.keys(results).length === 0) {
        if (chart) chart.destroy();
        document.getElementById('vortex-comparisonTable').innerHTML = '<tr><td colspan="5">Configure your deck with creatures (power 5+) to see results</td></tr>';
        const statsPanel = document.getElementById('vortex-stats');
        if (statsPanel) {
            statsPanel.innerHTML = '<p>Import a decklist to analyze Monstrous Vortex triggers.</p>';
        }
        return;
    }

    updateChart(config, results);
    updateTable(config, results);
    updateStats(config, results);

    // Call sample reveals if container exists and we have data
    if (document.getElementById('vortex-reveals-display') && config.cardDetails.length > 0) {
         runSampleReveals();
    }
}

/**
 * Initialize Vortex calculator
 */
export function init() {
    // Bind creature CMC slider
    const cmcSlider = document.getElementById('vortex-cmcSlider');
    const cmcValue = document.getElementById('vortex-cmcValue');

    if (cmcSlider && cmcValue) {
        cmcSlider.addEventListener('input', (e) => {
            cmcValue.value = e.target.value;
            updateUI();
        });

        cmcValue.addEventListener('input', (e) => {
            const value = parseInt(e.target.value) || 3;
            cmcSlider.value = Math.max(3, Math.min(value, 10));
            updateUI();
        });
    }

    // Bind sample reveal button
    const revealBtn = document.getElementById('vortex-draw-reveals-btn');
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
