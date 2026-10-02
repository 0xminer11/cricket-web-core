'use client';

import { useSyncExternalStore } from 'react';

/**
 * Match preferences for this visit (Module 11 sections 136-137): comfort settings, not game state. The web app never
 * touches browser storage (a repo-wide rule, enforced by a test), so these live in memory: they survive moving between
 * the match, the result and the career within a visit, and reset to the defaults on a reload. Nothing authoritative is
 * ever read from them, and the match plays identically whatever they are.
 */
export interface MatchSettings {
  readonly sound: boolean;
  /** 'auto' follows the device; the others force a quality tier. */
  readonly quality: 'auto' | 'low' | 'medium' | 'high';
  /** 'system' follows the device's reduced-motion setting. */
  readonly reducedMotion: 'system' | 'on' | 'off';
  /** The batting assist you start each ball with. */
  readonly battingAssist: 'off' | 'normal' | 'high' | 'auto';
  /** Time the bowling execution meter for you. */
  readonly bowlingAssist: boolean;
  readonly simulationSpeed: 'normal' | 'fast' | 'instant';
}

export const DEFAULT_SETTINGS: MatchSettings = {
  sound: false,
  quality: 'auto',
  reducedMotion: 'system',
  battingAssist: 'normal',
  bowlingAssist: false,
  simulationSpeed: 'fast',
};

let current: MatchSettings = DEFAULT_SETTINGS;
const listeners = new Set<() => void>();

export const getSettings = (): MatchSettings => current;

export function updateSettings(patch: Partial<MatchSettings>): void {
  current = { ...current, ...patch };
  for (const listener of [...listeners]) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The server render and the first client render use the defaults, so hydration always matches. */
export function useMatchSettings() {
  const settings = useSyncExternalStore(
    subscribe,
    getSettings,
    () => DEFAULT_SETTINGS,
  );
  return { settings, update: updateSettings };
}
