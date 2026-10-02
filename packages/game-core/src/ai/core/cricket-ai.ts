import { SHOTS } from '../../seed/shots.seed';
import { decideBatting } from '../batting/batting-decision-engine';
import { chooseBowlerAI } from '../bowling/bowler-selection';
import { decideBowling } from '../bowling/bowling-decision-engine';
import { deliveriesForStyle } from '../bowling/execution-model';
import { AIError } from '../types';
import type {
  AIDecisionTrace,
  AIDeliveryIntent,
  AIResult,
  AIShotIntent,
  BattingAIObservation,
  BowlerSelectionObservation,
  BowlingAIObservation,
  CricketAI,
} from '../types';
import { clamp } from './math';

export interface CricketAIOptions {
  /** Development hook: called with the error whenever a fallback is used. Never throws. */
  readonly onError?: (error: unknown) => void;
}

const fallbackTrace = (
  kind: AIDecisionTrace['kind'],
  selected: string,
  why: string,
  phase: AIDecisionTrace['phase'] = 'middle',
): AIDecisionTrace => ({
  kind,
  mode: 'FALLBACK',
  risk: 0,
  pressure: 0,
  phase,
  selected,
  reasons: [why],
  candidates: [],
  fallback: why,
});

/**
 * The Module 12 AI behind the CricketAI interface. If a decision ever fails (a bad observation, a broken configuration) the
 * match must go on: a safe, valid intent is returned instead (a forward defensive; a stock delivery on a good length) and the
 * error is reported to `onError` for development. It only throws when no eligible bowler/delivery exists, so the host can reject the invalid state.
 */
export function createCricketAI(options: CricketAIOptions = {}): CricketAI {
  const report = (e: unknown) => {
    try {
      options.onError?.(e);
    } catch {
      /* a reporting hook must never break a match */
    }
  };
  return {
    chooseBattingIntent(obs: BattingAIObservation): AIResult<AIShotIntent> {
      try {
        return decideBatting(obs);
      } catch (e) {
        report(e);
        const shot = SHOTS.find((s) => s.category === 'defensive') ?? SHOTS[0]!;
        const timing = obs.streams.stream(`ai:fallback:${obs.sequence}`).next();
        return {
          intent: {
            shotId: shot.id,
            timingInput: clamp((timing * 2 - 1) * 0.6, -1, 1),
            directionInput: 0,
          },
          trace: obs.trace
            ? fallbackTrace('batting', shot.id, e instanceof AIError ? e.code : 'AI_ERROR')
            : null,
        };
      }
    },
    chooseBowlingIntent(obs: BowlingAIObservation): AIResult<AIDeliveryIntent> {
      try {
        return decideBowling(obs);
      } catch (e) {
        report(e);
        const defs = obs.bowler?.style ? deliveriesForStyle(obs.bowler.style) : [];
        const def = defs.find((d) => d.defaultLength === 'good') ?? defs[0];
        if (!def) throw e; // there is no valid delivery to fall back to: the host must pick the bowler again
        return {
          intent: {
            variationId: def.id,
            line: 'off_stump',
            length: 'good',
            target: { x: 0.43, y: 0.46 },
          },
          trace: obs.trace
            ? fallbackTrace('bowling', def.id, e instanceof AIError ? e.code : 'AI_ERROR')
            : null,
        };
      }
    },
    chooseBowler(obs: BowlerSelectionObservation): AIResult<{ playerId: string }> {
      try {
        return chooseBowlerAI(obs);
      } catch (e) {
        report(e);
        const first = obs.candidates[0];
        if (!first) throw e;
        return {
          intent: { playerId: first.playerId },
          trace: obs.trace
            ? fallbackTrace('bowler_selection', first.playerId, e instanceof AIError ? e.code : 'AI_ERROR')
            : null,
        };
      }
    },
  };
}
