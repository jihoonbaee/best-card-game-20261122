// Ember Court — screenshot staging. Every scene is reached by playing
// the real rules with the autopilot, never by hand-placing cards: the
// screenshots show states a real game actually reaches. Deterministic
// per seed, so the same query always stages the same table.
import { newGame, startGame, endTurn } from './engine.js';
import { playTurnAuto } from './ai.js';

function playFullGame(seed) {
  const state = newGame(seed);
  startGame(state);
  let guard = 0;
  while (state.phase === 'play' && guard < 80) {
    playTurnAuto(state, state.active);
    if (state.phase !== 'over') endTurn(state);
    guard++;
  }
  return state;
}

export function stageShot(shot, seed) {
  if (shot === 'title') {
    return newGame(seed);
  }
  if (shot === 'play') {
    const state = newGame(seed);
    startGame(state);
    // Play through to the player's 4th turn, then let the player act so
    // the table looks lived-in: both boards holding creatures, a hand of
    // readable cards, life and ember partway spent.
    let guard = 0;
    while (state.phase === 'play' && !(state.turn >= 4 && state.active === 'player') && guard < 40) {
      playTurnAuto(state, state.active);
      if (state.phase !== 'over') endTurn(state);
      guard++;
    }
    if (state.phase === 'play') playTurnAuto(state, 'player');
    return state;
  }
  if (shot === 'win' || shot === 'loss') {
    const wantWinner = shot === 'win' ? 'player' : 'rival';
    // Scan twenty seeds and keep the hardest-fought duel with the wanted
    // winner: the longest game, then the one where the loser dealt the
    // most damage. A 7-turn 30-0 blowout is a real result, but a longer
    // game shows a fuller table and a closer fight.
    let best = null;
    let bestScore = -1;
    for (let s = seed; s < seed + 20; s++) {
      const state = playFullGame(s);
      if (state.winner !== wantWinner) continue;
      const winnerLife = state.sides[wantWinner].life;
      const score = state.turn * 100 + (30 - winnerLife);
      if (score > bestScore) {
        bestScore = score;
        best = state;
      }
    }
    return best ?? playFullGame(seed);
  }
  return newGame(seed);
}
