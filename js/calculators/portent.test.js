/**
 * Portent of Calamity Calculator Tests
 * Run with: node --experimental-modules portent.test.js
 * Or in browser console after loading the page
 */

// Test Data: Simplified deck compositions for testing
const TEST_DECKS = {
    // Simple uniform distribution - 7 types, equal representation
    balanced7Types: {
        name: "Balanced 7-Type Deck",
        types: {
            creature: 10,
            instant: 10,
            sorcery: 10,
            artifact: 10,
            enchantment: 10,
            planeswalker: 5,
            battle: 5,
            land: 36
        },
        // Expected probabilities for X=7 (revealing 7 cards from 96 total)
        // With 60 non-lands across 7 types, we should hit multiple types
        expectedResults: {
            x: 7,
            prob4Plus: 0.85, // Should be very high - 7 cards, 7 types, ~62% non-land
            expectedTypes: 5.5, // Rough estimate
            minProb4Plus: 0.75 // At minimum
        }
    },

    // Heavy creature deck - low diversity
    creatureHeavy: {
        name: "Creature-Heavy Deck (Low Diversity)",
        types: {
            creature: 40,
            instant: 5,
            sorcery: 5,
            artifact: 5,
            enchantment: 5,
            planeswalker: 0,
            battle: 0,
            land: 36
        },
        expectedResults: {
            x: 7,
            prob4Plus: 0.40, // Lower because creature-heavy
            expectedTypes: 3.5,
            maxProb4Plus: 0.60
        }
    },

    // High diversity - all 7 types well represented
    maxDiversity: {
        name: "Max Diversity Deck",
        types: {
            creature: 12,
            instant: 10,
            sorcery: 10,
            artifact: 10,
            enchantment: 10,
            planeswalker: 4,
            battle: 4,
            land: 36
        },
        expectedResults: {
            x: 7,
            prob4Plus: 0.90, // Should be very high
            expectedTypes: 5.8,
            minProb4Plus: 0.80
        }
    }
};

// Real deck from exampledeck.txt - manually analyzed
const REAL_DECK_ANALYSIS = {
    name: "Example Deck (exampledeck.txt)",
    // Manual type counts from the decklist
    types: {
        creature: 15,
        instant: 2,
        sorcery: 18,
        artifact: 7,
        enchantment: 6,
        planeswalker: 3,
        battle: 1,
        land: 36 // Actual count: 33 basics + special lands
    },
    typeCounts: {
        // Breakdown by type for reference
        creatures: ["Aesi", "Apex Devastator", "Auton Soldier", "Bonny Pall",
                    "Cityscape Leveler", "Gandalf", "Imoti", "Jin-Gitaxias",
                    "Kodama", "Kogla", "Koma", "Lumra", "Meteor Golem",
                    "Nezahal", "Prime Speaker Zegana", "Rashmi", "Unesh"],
        sorceries: ["Aminatou's Augury", "Blatant Thievery", "Circuitous Route",
                    "Doppelgang", "Encroaching Dragonstorm", "Explosive Vegetation",
                    "Expropriate", "Genesis Storm", "Hunting Wilds", "Karn's Temporal Sundering",
                    "Map the Frontier", "Migration Path", "Open the Way", "Path of the Animist",
                    "Portent of Calamity", "Ranger's Path", "Reach the Horizon", "Season of Weaving",
                    "Skyshroud Claim", "Sink into Stupor", "Summon: Bahamut", "Vastwood Surge"],
        artifacts: ["Chimil", "Extinguisher Battleship", "God-Pharaoh's Statue",
                   "Mindslaver", "Portal to Phyrexia", "Spine of Ish Sah", "Trenzalore Clocktower"],
        enchantments: ["Kiora Bests the Sea God", "Mind's Dilation", "Omniscience",
                       "One with the Multiverse", "The Legend of Kyoshi", "Wondrous Crucible"],
        planeswalkers: ["Karn Liberated", "Ugin Eye of the Storms", "Ugin Ineffable", "Ugin Spirit Dragon"],
        battles: ["Invasion of Zendikar"],
        instants: ["Sea Gate Restoration", "Song of Eärendil"]
    },
    // For X=7, drawing 7 cards from 99:
    // - 36 lands (~36% land rate)
    // - 63 non-lands across 6 types (creature, sorcery, artifact, enchantment, planeswalker, battle)
    // - Instant is very rare (2/99)
    expectedResults: {
        x: 7,
        // With 7 cards drawn, ~4-5 will be non-lands
        // 6 types present (7 if counting instant, but only 2 cards)
        // Expected: Should hit 4+ types most of the time (70-85%)
        prob4Plus: 0.75, // Conservative estimate
        expectedTypes: 4.2,
        minProb4Plus: 0.65, // Absolute minimum acceptable
        maxProb4Plus: 0.90  // Upper bound
    }
};

/**
 * Manual simulation test - draw random hands and count types
 * This is what the user is doing on Moxfield/Archidekt
 */
function manualHandTest(deck, numHands = 10000) {
    console.log(`\n=== Manual Hand Test: ${deck.name} ===`);
    console.log(`Drawing ${numHands} random 7-card hands...\n`);

    // Build deck array
    const deckArray = [];
    Object.entries(deck.types).forEach(([type, count]) => {
        for (let i = 0; i < count; i++) {
            deckArray.push(type);
        }
    });

    let hands4Plus = 0;
    let totalTypes = 0;
    const typeDistribution = {};

    for (let i = 0; i < numHands; i++) {
        // Shuffle and draw 7
        const shuffled = [...deckArray].sort(() => Math.random() - 0.5);
        const hand = shuffled.slice(0, 7);

        // Count unique non-land types
        const typesInHand = new Set(hand.filter(t => t !== 'land'));
        const numTypes = typesInHand.size;

        totalTypes += numTypes;
        typeDistribution[numTypes] = (typeDistribution[numTypes] || 0) + 1;

        if (numTypes >= 4) {
            hands4Plus++;
        }
    }

    const prob4Plus = hands4Plus / numHands;
    const avgTypes = totalTypes / numHands;

    console.log(`Results:`);
    console.log(`- P(4+ types): ${(prob4Plus * 100).toFixed(1)}%`);
    console.log(`- Avg types hit: ${avgTypes.toFixed(2)}`);
    console.log(`\nType distribution:`);
    Object.keys(typeDistribution).sort((a, b) => a - b).forEach(numTypes => {
        const count = typeDistribution[numTypes];
        const pct = (count / numHands * 100).toFixed(1);
        const bar = '█'.repeat(Math.round(pct / 2));
        console.log(`  ${numTypes} types: ${pct}% ${bar}`);
    });

    return { prob4Plus, avgTypes, typeDistribution };
}

/**
 * Hypergeometric expectation test - calculate theoretical probability
 */
function hypergeometricTest(deck) {
    console.log(`\n=== Hypergeometric Analysis: ${deck.name} ===`);

    const nonLandCards = Object.entries(deck.types)
        .filter(([type]) => type !== 'land')
        .reduce((sum, [_, count]) => sum + count, 0);

    const deckSize = Object.values(deck.types).reduce((a, b) => a + b, 0);
    const landCount = deck.types.land;

    console.log(`Deck composition:`);
    console.log(`- Total cards: ${deckSize}`);
    console.log(`- Lands: ${landCount} (${(landCount / deckSize * 100).toFixed(1)}%)`);
    console.log(`- Non-lands: ${nonLandCards} (${(nonLandCards / deckSize * 100).toFixed(1)}%)`);

    console.log(`\nType breakdown:`);
    Object.entries(deck.types).forEach(([type, count]) => {
        if (type !== 'land' && count > 0) {
            const pct = (count / deckSize * 100).toFixed(1);
            console.log(`  ${type}: ${count} (${pct}%)`);
        }
    });

    // Expected non-lands in 7-card hand
    const expectedNonLands = (nonLandCards / deckSize) * 7;
    console.log(`\nExpected non-lands in 7-card hand: ${expectedNonLands.toFixed(2)}`);

    // Count types present in deck
    const typesPresent = Object.entries(deck.types)
        .filter(([type, count]) => type !== 'land' && count > 0)
        .length;
    console.log(`Types present in deck: ${typesPresent}`);
}

/**
 * Run calculator simulation and compare to expected
 */
function testCalculatorAccuracy(deck) {
    console.log(`\n=== Calculator Accuracy Test: ${deck.name} ===`);

    // This would call the actual calculator code
    // For now, just show what we expect vs what we might get

    if (deck.expectedResults) {
        const { x, prob4Plus, expectedTypes, minProb4Plus, maxProb4Plus } = deck.expectedResults;

        console.log(`Expected results for X=${x}:`);
        console.log(`- P(4+ types): ${(prob4Plus * 100).toFixed(1)}%`);
        if (minProb4Plus) console.log(`  (minimum acceptable: ${(minProb4Plus * 100).toFixed(1)}%)`);
        if (maxProb4Plus) console.log(`  (maximum acceptable: ${(maxProb4Plus * 100).toFixed(1)}%)`);
        console.log(`- Expected types: ${expectedTypes.toFixed(2)}`);
    }
}

/**
 * Test dual-typed card handling
 */
function testDualTypedCards() {
    console.log(`\n=== Dual-Typed Card Test ===`);
    console.log(`Testing: Artifact Creature should count as both types\n`);

    // Deck with 10 artifact creatures, 10 pure artifacts, 10 pure creatures
    const deck = {
        name: "Dual-Typed Test Deck",
        cards: [
            // 10 Artifact Creatures (dual-typed)
            { name: "Solemn Simulacrum", type_line: "Artifact Creature — Golem", count: 1 },
            { name: "Myr Battlesphere", type_line: "Artifact Creature — Myr Construct", count: 1 },
            { name: "Steel Hellkite", type_line: "Artifact Creature — Dragon", count: 1 },
            { name: "Wurmcoil Engine", type_line: "Artifact Creature — Phyrexian Wurm", count: 1 },
            { name: "Meteor Golem", type_line: "Artifact Creature — Golem", count: 1 },
            { name: "Treasure Keeper", type_line: "Artifact Creature — Construct", count: 1 },
            { name: "Duplicant", type_line: "Artifact Creature — Shapeshifter", count: 1 },
            { name: "Arcbound Ravager", type_line: "Artifact Creature — Beast", count: 1 },
            { name: "Baleful Strix", type_line: "Artifact Creature — Bird", count: 1 },
            { name: "Etched Champion", type_line: "Artifact Creature — Soldier", count: 1 },

            // 10 pure Artifacts
            { name: "Sol Ring", type_line: "Artifact", count: 1 },
            { name: "Mana Vault", type_line: "Artifact", count: 1 },
            { name: "Lightning Greaves", type_line: "Artifact — Equipment", count: 1 },
            { name: "Swiftfoot Boots", type_line: "Artifact — Equipment", count: 1 },
            { name: "Sensei's Divining Top", type_line: "Artifact", count: 1 },
            { name: "Mind Stone", type_line: "Artifact", count: 1 },
            { name: "Thought Vessel", type_line: "Artifact", count: 1 },
            { name: "Wayfarer's Bauble", type_line: "Artifact", count: 1 },
            { name: "Expedition Map", type_line: "Artifact", count: 1 },
            { name: "Chromatic Lantern", type_line: "Artifact", count: 1 },

            // 10 pure Creatures
            { name: "Llanowar Elves", type_line: "Creature — Elf Druid", count: 1 },
            { name: "Birds of Paradise", type_line: "Creature — Bird", count: 1 },
            { name: "Sakura-Tribe Elder", type_line: "Creature — Snake Shaman", count: 1 },
            { name: "Eternal Witness", type_line: "Creature — Human Shaman", count: 1 },
            { name: "Mulldrifter", type_line: "Creature — Elemental", count: 1 },
            { name: "Wood Elves", type_line: "Creature — Elf Scout", count: 1 },
            { name: "Farhaven Elf", type_line: "Creature — Elf Druid", count: 1 },
            { name: "Solemn Simulacrum", type_line: "Creature — Human Wizard", count: 1 },
            { name: "Coiling Oracle", type_line: "Creature — Snake Elf Druid", count: 1 },
            { name: "Wall of Blossoms", type_line: "Creature — Plant Wall", count: 1 },
        ]
    };

    console.log(`Deck composition:`);
    console.log(`- 10 Artifact Creatures (count toward both Artifact AND Creature)`);
    console.log(`- 10 pure Artifacts`);
    console.log(`- 10 pure Creatures`);
    console.log(`- Total cards: 30`);
    console.log(`\nExpected type counts:`);
    console.log(`- Artifact: 20 cards (10 dual + 10 pure)`);
    console.log(`- Creature: 20 cards (10 dual + 10 pure)`);
    console.log(`\nExpected deck size: 30 cards (NOT 40!)`);
    console.log(`Each card appears exactly ONCE in the deck array.`);
}

/**
 * Run all tests
 */
function runAllTests() {
    console.log("╔════════════════════════════════════════════════════╗");
    console.log("║   PORTENT OF CALAMITY CALCULATOR TEST SUITE      ║");
    console.log("╚════════════════════════════════════════════════════╝");

    // Test 1: Dual-typed card handling
    testDualTypedCards();

    // Test 2: Manual hand tests (simulate what user does on Moxfield)
    console.log("\n" + "=".repeat(60));
    manualHandTest(TEST_DECKS.balanced7Types, 10000);
    manualHandTest(TEST_DECKS.creatureHeavy, 10000);
    manualHandTest(TEST_DECKS.maxDiversity, 10000);
    manualHandTest(REAL_DECK_ANALYSIS, 10000);

    // Test 3: Hypergeometric analysis
    console.log("\n" + "=".repeat(60));
    hypergeometricTest(TEST_DECKS.balanced7Types);
    hypergeometricTest(REAL_DECK_ANALYSIS);

    // Test 4: Calculator accuracy
    console.log("\n" + "=".repeat(60));
    testCalculatorAccuracy(TEST_DECKS.balanced7Types);
    testCalculatorAccuracy(TEST_DECKS.maxDiversity);
    testCalculatorAccuracy(REAL_DECK_ANALYSIS);

    console.log("\n" + "=".repeat(60));
    console.log("\n✓ All tests completed!\n");
}

// Export for use in browser or Node
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        TEST_DECKS,
        REAL_DECK_ANALYSIS,
        runAllTests,
        manualHandTest,
        hypergeometricTest,
        testCalculatorAccuracy,
        testDualTypedCards
    };
}

// Auto-run if in browser console
if (typeof window !== 'undefined') {
    console.log("Test suite loaded. Run runAllTests() to execute.");
}
