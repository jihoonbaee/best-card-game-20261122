// Ember Court — boot and the turn loop. In a browser it starts on the
// title screen; with ?shot=title|play|win|loss it stages that scene for
// a screenshot instead. The Rival plays its turn step by step with a
// pause between actions, so a human can follow what it does.
import { CONFIG } from './config.js';
import { endTurn, newGame, playCard, startGame, drainEvents } from './engine.js';
import { nextAction } from './ai.js';
import { handleEvents, render } from './render.js';
import { attachInput } from './input.js';
import { playSound } from './sound.js';
import { stageShot } from './shots.js';

let state = null;
const ui = { selected: null, targetMode: false, legalTargets: [] };
let rivalRunning = false;

function refresh() {
  render(state, ui);
}

function afterAction(sound) {
  const events = drainEvents(state);
  refresh();
  handleEvents(events);
  if (sound) playSound(sound);
  if (state.phase === 'over') {
    playSound(state.winner === 'player' ? 'win' : 'lose');
  }
}

function clearSelection() {
  ui.selected = null;
  ui.targetMode = false;
  ui.legalTargets = [];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runRivalTurn() {
  if (rivalRunning) return;
  rivalRunning = true;
  await sleep(CONFIG.RIVAL_STEP_MS);
  while (state.phase === 'play' && state.active === 'rival') {
    const action = nextAction(state, 'rival');
    if (!action) break;
    playCard(state, 'rival', action.handIndex, action.target);
    afterAction('play');
    await sleep(CONFIG.RIVAL_STEP_MS);
  }
  if (state.phase === 'play' && state.active === 'rival') {
    endTurn(state);
    afterAction('turn');
  }
  rivalRunning = false;
}

function freshSeed() {
  return (Date.now() % 2147483647) + 1;
}

function boot() {
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  const seed = Number(params.get('seed')) || 7;

  if (shot) {
    state = stageShot(shot, seed);
    refresh();
    handleEvents(drainEvents(state));
    window.__shotReady = true;
    return;
  }

  state = newGame(freshSeed());
  refresh();

  attachInput(
    () => ({ state, ui }),
    {
      onUi: refresh,
      onSound: playSound,
      onBegin: () => {
        startGame(state);
        clearSelection();
        afterAction('turn');
      },
      onAgain: () => {
        state = newGame(freshSeed());
        clearSelection();
        startGame(state);
        afterAction('turn');
      },
      onPlay: (handIndex, target) => {
        if (playCard(state, 'player', handIndex, target)) {
          clearSelection();
          afterAction('play');
        } else {
          refresh();
        }
      },
      onEndTurn: () => {
        clearSelection();
        endTurn(state);
        afterAction('turn');
        if (state.phase === 'play' && state.active === 'rival') {
          void runRivalTurn();
        }
      },
    },
  );
}

boot();
