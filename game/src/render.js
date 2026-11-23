// Ember Court — the DOM renderer. It paints the state: panels, boards,
// hand, log and overlays. Card nodes are keyed by uid and reused across
// renders, so a card keeps its identity (and its animation) as it moves.
import { CONFIG } from './config.js';
import { HOUSES, cardDef } from './cards.js';
import { otherSide } from './engine.js';

const $ = (id) => document.getElementById(id);

// uid -> card node, kept between renders.
const nodeCache = new Map();
// uids present on the last render (to spot newcomers for animations).
let seenUids = new Set();

function houseOf(card) {
  return HOUSES[cardDef(card.defId).house];
}

function cardNode(card, opts) {
  const def = cardDef(card.defId);
  const house = HOUSES[def.house];
  let node = nodeCache.get(card.uid);
  if (!node) {
    node = document.createElement('div');
    nodeCache.set(card.uid, node);
  }
  // Always rewrite the whole className: a node that once wore the 'back'
  // class must never keep it after it becomes a face card.
  node.className = `card house-${def.house}${opts.board ? ' on-board' : ''}${opts.selected ? ' selected' : ''}${opts.playable ? ' playable' : ''}${opts.dim ? ' dim' : ''}`;
  node.dataset.uid = card.uid;
  node.dataset.handIndex = opts.handIndex ?? '';
  const stats =
    def.kind === 'creature'
      ? `<div class="card-stats"><span class="atk">${card.power}</span><span class="hp">${card.health}</span></div>`
      : `<div class="card-stats spell-stats"><span class="spell-tag">SPELL</span></div>`;
  node.innerHTML =
    `<div class="card-cost">${def.cost}</div>` +
    `<div class="card-art" style="color:${house.color}">${house.shape}</div>` +
    `<div class="card-name">${def.name}</div>` +
    (def.text ? `<div class="card-text">${def.text}</div>` : `<div class="card-text quiet">${house.name} house</div>`) +
    stats;
  return node;
}

function backNode(uid) {
  let node = nodeCache.get(uid);
  if (!node) {
    node = document.createElement('div');
    nodeCache.set(uid, node);
  }
  node.className = 'card back';
  node.dataset.uid = uid;
  node.innerHTML = '<div class="back-emblem">▲</div>';
  return node;
}

function setChildren(el, nodes) {
  // Replace children, reusing the nodes themselves (they keep state).
  const current = Array.from(el.children);
  const wanted = new Set(nodes);
  for (const child of current) {
    if (!wanted.has(child)) el.removeChild(child);
  }
  nodes.forEach((node, i) => {
    if (el.children[i] !== node) el.insertBefore(node, el.children[i] ?? null);
  });
}

function panelLife(side, state) {
  const s = state.sides[side];
  return `${s.life}`;
}

export function render(state, ui) {
  const nextSeen = new Set();
  const isPlayerTurn = state.active === 'player' && state.phase === 'play';

  // --- Panels ---
  $('rival-life').textContent = panelLife('rival', state);
  $('player-life').textContent = panelLife('player', state);
  $('rival-ember').textContent = `${state.sides.rival.ember}/${state.sides.rival.emberMax}`;
  $('player-ember').textContent = `${state.sides.player.ember}/${state.sides.player.emberMax}`;
  $('rival-deck').textContent = `Deck ${state.sides.rival.deck.length}`;
  $('player-deck').textContent = `Deck ${state.sides.player.deck.length}`;
  $('turn-label').textContent =
    state.phase === 'over'
      ? `Duel over — Turn ${state.turn}`
      : state.phase === 'title'
        ? 'Ember Court'
        : `Turn ${state.turn} — ${isPlayerTurn ? 'Your move' : "Rival's move"}`;
  $('end-turn').disabled = !isPlayerTurn;
  $('end-turn').classList.toggle('glow', isPlayerTurn);

  // --- Rival hand (backs) ---
  const rivalHand = state.sides.rival.hand.map((card, i) => {
    const node = backNode(`rival-hand-${card.uid}`);
    nextSeen.add(`rival-hand-${card.uid}`);
    return node;
  });
  setChildren($('rival-hand'), rivalHand);

  // --- Boards ---
  for (const side of ['rival', 'player']) {
    const slots = [];
    state.sides[side].board.forEach((card, slot) => {
      const slotEl = document.createElement('div');
      slotEl.className = 'slot';
      slotEl.dataset.side = side;
      slotEl.dataset.slot = slot;
      if (card) {
        const fresh = !seenUids.has(card.uid);
        const node = cardNode(card, { board: true });
        if (fresh) node.classList.add('place-in');
        nextSeen.add(card.uid);
        slotEl.appendChild(node);
      }
      if (ui.targetMode && ui.legalTargets.some((t) => t.kind === 'creature' && t.side === side && t.slot === slot)) {
        slotEl.classList.add('targetable');
      }
      slots.push(slotEl);
    });
    setChildren($(side === 'rival' ? 'rival-board' : 'player-board'), slots);
  }

  // --- Player hand ---
  const handNodes = state.sides.player.hand.map((card, i) => {
    const def = cardDef(card.defId);
    const playable = isPlayerTurn && def.cost <= state.sides.player.ember;
    const fresh = !seenUids.has(card.uid);
    const node = cardNode(card, {
      selected: ui.selected === i,
      playable,
      dim: isPlayerTurn && !playable,
      handIndex: i,
    });
    if (fresh) node.classList.add('deal-in');
    nextSeen.add(card.uid);
    return node;
  });
  setChildren($('player-hand'), handNodes);

  // --- Hero panels as spell targets ---
  for (const side of ['rival', 'player']) {
    const panel = $(side === 'rival' ? 'rival-panel' : 'player-panel');
    const targetable =
      ui.targetMode && ui.legalTargets.some((t) => t.kind === 'hero' && t.side === side);
    panel.classList.toggle('targetable', targetable);
  }

  // --- Log (last 3 lines) ---
  const lines = state.log.slice(-3);
  $('log').innerHTML = lines.map((l) => `<div class="log-line">${escapeHtml(l)}</div>`).join('');

  // --- Overlay ---
  renderOverlay(state);

  // Drop cached nodes that no longer belong to any card.
  for (const uid of nodeCache.keys()) {
    if (!nextSeen.has(uid) && !uid.startsWith('rival-hand-')) nodeCache.delete(uid);
  }
  seenUids = nextSeen;
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderOverlay(state) {
  const overlay = $('overlay');
  if (state.phase === 'title') {
    overlay.className = 'overlay show title-screen';
    overlay.innerHTML =
      '<div class="title-box">' +
      '<div class="title-gem">▲</div>' +
      '<h1>EMBER COURT</h1>' +
      '<p class="tagline">A duel of ember, tide, thorn and moon.</p>' +
      '<p class="howto">Play creatures to the table. At the end of your turn they strike ' +
      'the creature across from them — or the Rival, when the way is clear. ' +
      'First hero to 0 life loses.</p>' +
      '<div class="houses">' +
      Object.values(HOUSES)
        .map((h) => `<div class="house"><span class="house-shape" style="color:${h.color}">${h.shape}</span><b>${h.name}</b><i>${h.text}</i></div>`)
        .join('') +
      '</div>' +
      '<button id="begin-btn" class="big-btn">Begin the Duel</button>' +
      '<p class="keys">Mouse or keys 1–7 to pick a card · Enter to end turn · Esc to cancel</p>' +
      '</div>';
    return;
  }
  if (state.phase === 'over') {
    const won = state.winner === 'player';
    overlay.className = `overlay show ${won ? 'win-screen' : 'loss-screen'}`;
    overlay.innerHTML =
      '<div class="end-box">' +
      `<div class="end-mark">${won ? '★' : '✕'}</div>` +
      `<h1>${won ? 'YOU WIN!' : 'DEFEAT'}</h1>` +
      `<p class="final-score">Final life — You ${state.sides.player.life} · Rival ${state.sides.rival.life} · Turn ${state.turn}</p>` +
      '<button id="again-btn" class="big-btn">Play Again</button>' +
      '</div>';
    return;
  }
  overlay.className = 'overlay';
  overlay.innerHTML = '';
}

// Floating damage/heal numbers plus a flash on the thing that was hit.
export function handleEvents(events) {
  const layer = $('floaters');
  const app = $('app');
  for (const ev of events) {
    if (ev.type === 'damage' || ev.type === 'heal') {
      const amount = ev.type === 'damage' ? `-${ev.amount}` : `+${ev.amount}`;
      const anchor = anchorFor(ev);
      if (!anchor) continue;
      const rect = anchor.getBoundingClientRect();
      const appRect = app.getBoundingClientRect();
      const span = document.createElement('span');
      span.className = `floater ${ev.type}`;
      span.textContent = amount;
      span.style.left = `${rect.left - appRect.left + rect.width / 2}px`;
      span.style.top = `${rect.top - appRect.top + rect.height / 2}px`;
      layer.appendChild(span);
      anchor.classList.add('flash');
      setTimeout(() => anchor.classList.remove('flash'), 350);
      setTimeout(() => span.remove(), CONFIG.FLOATER_MS);
    } else if (ev.type === 'combat' && !ev.face) {
      // The victim is the creature across the table, same slot.
      const victim = document.querySelector(`.slot[data-side="${otherSide(ev.side)}"][data-slot="${ev.slot}"] .card`);
      if (victim) {
        victim.classList.add('flash');
        setTimeout(() => victim.classList.remove('flash'), 350);
        const rect = victim.getBoundingClientRect();
        const appRect = app.getBoundingClientRect();
        const span = document.createElement('span');
        span.className = 'floater damage';
        span.textContent = `-${ev.amount}`;
        span.style.left = `${rect.left - appRect.left + rect.width / 2}px`;
        span.style.top = `${rect.top - appRect.top + rect.height / 2}px`;
        layer.appendChild(span);
        setTimeout(() => span.remove(), CONFIG.FLOATER_MS);
      }
    }
  }
}

function anchorFor(ev) {
  if (ev.target === 'hero') {
    return $(ev.side === 'rival' ? 'rival-panel' : 'player-panel');
  }
  if (ev.target === 'creature') {
    return document.querySelector(`.slot[data-side="${ev.side}"][data-slot="${ev.slot}"] .card`);
  }
  return null;
}
