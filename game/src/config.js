// Ember Court — every number the rules use, in one place.
// The engine, the AI and the renderer all read from here, so tuning the
// game means editing this file and nothing else.
export const CONFIG = {
  // Life each duelist starts with. 30 keeps games at 6-13 turns; 20
  // snowballed into 20-0 blowouts in testing.
  START_LIFE: 30,
  // Ember is the resource: it grows by 1 each of your turns, to this cap.
  MAX_EMBER: 10,
  // Board slots per side. Combat pairs creatures by slot number.
  BOARD_SLOTS: 5,
  // Cards in hand at the start of the game.
  START_HAND: 3,
  // Largest hand the keyboard can reach (keys 1-7 select a card).
  HAND_LIMIT: 7,
  // Copies of each unique card in a deck.
  DECK_COPIES: 2,
  // Milliseconds the rival pauses between its animated actions.
  RIVAL_STEP_MS: 650,
  // Milliseconds a floating damage/heal number stays on screen.
  FLOATER_MS: 1100,
};
