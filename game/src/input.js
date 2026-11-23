// Ember Court — mouse and keyboard. Click a hand card to pick it up;
// a creature or a no-target spell plays at once, a targeted spell waits
// for you to click its target. Keys 1-7 pick a card, Enter ends the
// turn, Esc puts the card back down.
import { cardDef } from './cards.js';
import { canPlay, spellTargetKind, spellTargets } from './engine.js';

export function attachInput(getCtx, hooks) {
  const app = document.getElementById('app');

  function pickCard(handIndex) {
    const { state, ui } = getCtx();
    if (state.phase !== 'play' || state.active !== 'player') return;
    if (ui.selected === handIndex) {
      ui.selected = null;
      ui.targetMode = false;
      ui.legalTargets = [];
      hooks.onUi();
      return;
    }
    if (!canPlay(state, 'player', handIndex)) return;
    const card = state.sides.player.hand[handIndex];
    const def = cardDef(card.defId);
    ui.selected = handIndex;
    hooks.onSound('pick');
    if (def.kind === 'spell' && spellTargetKind(def) !== 'none') {
      ui.targetMode = true;
      ui.legalTargets = spellTargets(state, 'player', def);
    } else {
      hooks.onPlay(handIndex, null);
      return;
    }
    hooks.onUi();
  }

  function clickTarget(target) {
    const { ui } = getCtx();
    if (!ui.targetMode || ui.selected === null) return;
    const legal = ui.legalTargets.some(
      (t) =>
        t.kind === target.kind &&
        t.side === target.side &&
        (t.kind !== 'creature' || t.slot === target.slot),
    );
    if (!legal) return;
    hooks.onPlay(ui.selected, target);
  }

  app.addEventListener('click', (event) => {
    const { ui } = getCtx();
    const begin = event.target.closest('#begin-btn');
    if (begin) {
      hooks.onBegin();
      return;
    }
    const again = event.target.closest('#again-btn');
    if (again) {
      hooks.onAgain();
      return;
    }
    const endTurn = event.target.closest('#end-turn');
    if (endTurn && !endTurn.disabled) {
      hooks.onEndTurn();
      return;
    }
    const handCard = event.target.closest('#player-hand .card');
    if (handCard) {
      pickCard(Number(handCard.dataset.handIndex));
      return;
    }
    const slot = event.target.closest('.slot.targetable');
    if (slot) {
      clickTarget({ kind: 'creature', side: slot.dataset.side, slot: Number(slot.dataset.slot) });
      return;
    }
    const panel = event.target.closest('.hero-panel.targetable');
    if (panel) {
      clickTarget({ kind: 'hero', side: panel.dataset.side });
      return;
    }
    // Clicking anywhere else puts the picked card back down.
    if (ui.selected !== null) {
      ui.selected = null;
      ui.targetMode = false;
      ui.legalTargets = [];
      hooks.onUi();
    }
  });

  document.addEventListener('keydown', (event) => {
    const { state, ui } = getCtx();
    if (event.key === 'Escape') {
      if (ui.selected !== null) {
        ui.selected = null;
        ui.targetMode = false;
        ui.legalTargets = [];
        hooks.onUi();
      }
      return;
    }
    if (event.key === 'Enter') {
      if (state.phase === 'title') hooks.onBegin();
      else if (state.phase === 'play' && state.active === 'player') hooks.onEndTurn();
      else if (state.phase === 'over') hooks.onAgain();
      return;
    }
    const n = Number(event.key);
    if (n >= 1 && n <= 7) pickCard(n - 1);
  });
}
