// Builds a deck from the card definitions: every unique card appears
// DECK_COPIES times, then the deck is shuffled with the seeded rng.
// Each card instance gets a uid prefixed by its side ('player-' or
// 'rival-'), so the two decks never share an id — the renderer keys its
// DOM nodes by uid, and a collision once moved nodes across the table.
import { CARDS } from './cards.js';
import { CONFIG } from './config.js';
import { shuffle } from './random.js';

export function buildDeck(rng, sidePrefix) {
  const cards = [];
  let n = 0;
  for (const def of CARDS) {
    for (let copy = 0; copy < CONFIG.DECK_COPIES; copy++) {
      cards.push({
        uid: `${sidePrefix}-c${n}`,
        defId: def.id,
        power: def.power ?? 0,
        health: def.health ?? 0,
        maxHealth: def.health ?? 0,
      });
      n++;
    }
  }
  return shuffle(cards, rng);
}
