// Ember Court — the rules, pure and without any DOM. The renderer, the
// AI and the balance simulations all drive the game through this file, so
// a rule changed here changes every one of them the same way.
import { CONFIG } from './config.js';
import { cardDef } from './cards.js';
import { buildDeck } from './deck.js';
import { mulberry32 } from './random.js';

export function otherSide(side) {
  return side === 'player' ? 'rival' : 'player';
}

function newSide(seed, rng, prefix) {
  return {
    life: CONFIG.START_LIFE,
    emberMax: 0,
    ember: 0,
    deck: buildDeck(rng, prefix),
    hand: [],
    board: Array.from({ length: CONFIG.BOARD_SLOTS }, () => null),
  };
}

export function newGame(seed) {
  const rng = mulberry32(seed);
  const state = {
    seed,
    rng,
    turn: 0,
    phase: 'title',
    active: 'player',
    winner: null,
    sides: {
      player: newSide(seed, rng, 'player'),
      rival: newSide(seed, rng, 'rival'),
    },
    log: [],
    events: [],
  };
  return state;
}

export function log(state, text) {
  state.log.push(text);
  if (state.log.length > 40) state.log.splice(0, state.log.length - 40);
}

function emit(state, event) {
  state.events.push(event);
}

export function drainEvents(state) {
  const out = state.events;
  state.events = [];
  return out;
}

export function boardCount(state, side) {
  return state.sides[side].board.filter(Boolean).length;
}

export function freeSlot(state, side) {
  return state.sides[side].board.findIndex((c) => c === null);
}

function drawCards(state, side, count) {
  const s = state.sides[side];
  let drawn = 0;
  for (let i = 0; i < count; i++) {
    const card = s.deck.pop();
    if (!card) break;
    if (s.hand.length >= CONFIG.HAND_LIMIT) {
      log(state, `${side === 'player' ? 'You' : 'Rival'} burn a card (hand full).`);
      continue;
    }
    s.hand.push(card);
    drawn++;
  }
  if (drawn > 0) emit(state, { type: 'draw', side, count: drawn });
  return drawn;
}

// Deals the opening hands and starts the player's first turn.
export function startGame(state) {
  state.phase = 'play';
  state.turn = 1;
  drawCards(state, 'player', CONFIG.START_HAND);
  drawCards(state, 'rival', CONFIG.START_HAND);
  beginTurn(state, 'player');
  log(state, 'The duel begins. Your move.');
}

function beginTurn(state, side) {
  const s = state.sides[side];
  s.emberMax = Math.min(s.emberMax + 1, CONFIG.MAX_EMBER);
  s.ember = s.emberMax;
  state.active = side;
  drawCards(state, side, 1);
  emit(state, { type: 'turn', side, turn: state.turn });
}

function damageHero(state, side, amount) {
  const s = state.sides[side];
  s.life = Math.max(0, s.life - amount);
  emit(state, { type: 'damage', side, target: 'hero', amount });
}

function healHero(state, side, amount) {
  const s = state.sides[side];
  s.life = Math.min(CONFIG.START_LIFE, s.life + amount);
  emit(state, { type: 'heal', side, target: 'hero', amount });
}

function damageCreature(state, side, slot, amount) {
  const card = state.sides[side].board[slot];
  if (!card) return;
  card.health -= amount;
  emit(state, { type: 'damage', side, target: 'creature', slot, amount });
}

function removeDead(state) {
  for (const side of ['player', 'rival']) {
    const board = state.sides[side].board;
    for (let slot = 0; slot < board.length; slot++) {
      const card = board[slot];
      if (card && card.health <= 0) {
        board[slot] = null;
        emit(state, { type: 'death', side, slot, name: cardDef(card.defId).name });
        log(state, `${cardDef(card.defId).name} falls.`);
      }
    }
  }
}

function checkEnd(state) {
  const p = state.sides.player.life;
  const r = state.sides.rival.life;
  if (p <= 0 && r <= 0) {
    state.phase = 'over';
    state.winner = state.active === 'player' ? 'rival' : 'player';
  } else if (r <= 0) {
    state.phase = 'over';
    state.winner = 'player';
  } else if (p <= 0) {
    state.phase = 'over';
    state.winner = 'rival';
  }
  if (state.phase === 'over') {
    emit(state, { type: 'win', winner: state.winner });
    log(state, state.winner === 'player' ? 'You win the duel!' : 'The Rival wins the duel.');
  }
  return state.phase === 'over';
}

// What a spell needs as a target: 'any' (any hero or creature),
// 'own-creature' (one of your creatures), or 'none' (no choice).
export function spellTargetKind(def) {
  if (def.kind !== 'spell') return null;
  if (def.effect === 'bolt') return 'any';
  if (def.effect === 'ward') return 'own-creature';
  return 'none';
}

// All legal targets for a spell, as {kind:'hero',side} or
// {kind:'creature',side,slot}. Used by the UI to highlight choices.
export function spellTargets(state, side, def) {
  const kind = spellTargetKind(def);
  const out = [];
  if (kind === 'any') {
    out.push({ kind: 'hero', side: otherSide(side) });
    out.push({ kind: 'hero', side });
    for (const s of ['player', 'rival']) {
      state.sides[s].board.forEach((card, slot) => {
        if (card) out.push({ kind: 'creature', side: s, slot });
      });
    }
  } else if (kind === 'own-creature') {
    state.sides[side].board.forEach((card, slot) => {
      if (card) out.push({ kind: 'creature', side, slot });
    });
  }
  return out;
}

export function canPlay(state, side, handIndex) {
  const s = state.sides[side];
  const card = s.hand[handIndex];
  if (!card) return false;
  const def = cardDef(card.defId);
  if (def.cost > s.ember) return false;
  if (def.kind === 'creature') return freeSlot(state, side) !== -1;
  if (spellTargetKind(def) === 'own-creature') {
    return boardCount(state, side) > 0;
  }
  return true;
}

// Plays the card at handIndex. For a targeted spell, target is one of
// spellTargets(); for anything else it is ignored. Returns true when the
// play happened.
export function playCard(state, side, handIndex, target) {
  const s = state.sides[side];
  const card = s.hand[handIndex];
  if (!card || !canPlay(state, side, handIndex)) return false;
  const def = cardDef(card.defId);
  s.ember -= def.cost;
  s.hand.splice(handIndex, 1);
  const who = side === 'player' ? 'You play' : 'Rival plays';
  log(state, `${who} ${def.name}.`);
  emit(state, { type: 'play', side, name: def.name, kind: def.kind });

  if (def.kind === 'creature') {
    const slot = freeSlot(state, side);
    s.board[slot] = card;
    emit(state, { type: 'place', side, slot, name: def.name });
    if (def.battlecry === 'draw1') {
      drawCards(state, side, 1);
      log(state, `${def.name} draws you a card.`);
    }
    return true;
  }

  // Spells resolve at once.
  if (def.effect === 'bolt') {
    if (!target) return true;
    if (target.kind === 'hero') damageHero(state, target.side, 3);
    else damageCreature(state, target.side, target.slot, 3);
    removeDead(state);
  } else if (def.effect === 'mend') {
    healHero(state, side, 5);
  } else if (def.effect === 'surge') {
    drawCards(state, side, 2);
  } else if (def.effect === 'ward') {
    if (target && target.kind === 'creature') {
      const c = state.sides[target.side].board[target.slot];
      if (c) {
        c.health += 3;
        c.maxHealth += 3;
        emit(state, { type: 'heal', side: target.side, target: 'creature', slot: target.slot, amount: 3 });
      }
    }
  } else if (def.effect === 'flare') {
    const enemy = otherSide(side);
    state.sides[enemy].board.forEach((card, slot) => {
      if (card) damageCreature(state, enemy, slot, 2);
    });
    removeDead(state);
  }
  checkEnd(state);
  return true;
}

// Combat: the active side's creatures strike. Each creature hits the
// creature in front of it (same slot), damage simultaneous, or the enemy
// hero when the slot is empty. Then the turn passes.
export function endTurn(state) {
  const side = state.active;
  const enemy = otherSide(side);
  const board = state.sides[side].board;
  const enemyBoard = state.sides[enemy].board;
  log(state, `${side === 'player' ? 'Your' : "Rival's"} creatures strike.`);
  for (let slot = 0; slot < board.length; slot++) {
    const attacker = board[slot];
    if (!attacker) continue;
    const defender = enemyBoard[slot];
    if (defender) {
      defender.health -= attacker.power;
      attacker.health -= defender.power;
      emit(state, { type: 'combat', side, slot, amount: attacker.power });
      emit(state, { type: 'combat', side: enemy, slot, amount: defender.power });
    } else {
      damageHero(state, enemy, attacker.power);
      emit(state, { type: 'combat', side, slot, amount: attacker.power, face: true });
    }
  }
  removeDead(state);
  if (checkEnd(state)) return;
  if (enemy === 'player') state.turn += 1;
  beginTurn(state, enemy);
}
