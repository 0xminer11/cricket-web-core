export const GAME_BALANCE_VERSION = '1';
export const MATCH_ENGINE_VERSION = '2';
export const DATA_SCHEMA_VERSION = 2;
/**
 * Module 12. The AI engine version names the decision ALGORITHM (observation, utilities, plans, selection); the AI config
 * version names the tuning numbers. Matches record the intents the AI chose, so replays never ask a newer AI to decide
 * an old ball; a change to either version only affects matches played after it.
 */
export const AI_ENGINE_VERSION = '1';
export const AI_CONFIG_VERSION = '1';
