import type {
  DeliveryPreviewDto,
  DeliveryResultDto,
} from '@the-cricketer/shared-types';
import type { BattingHand } from './coordinates';
import type { NormalizedTarget } from './coordinates';
import type { Vec3 } from './vec';

/** Everything the scene needs to draw a match; none of it is a result. */
export interface SceneMatchInfo {
  /** Which end the player is at: bowling (aiming) or batting (reading and timing). */
  readonly mode?: 'bowling' | 'batting';
  readonly pitchKind: 'green' | 'hard' | 'dry';
  readonly battingHand: BattingHand;
  readonly bowlerStyle: string;
  readonly bowlerName: string;
  readonly batterName: string;
  readonly bowlingTeamName: string;
  readonly battingTeamName: string;
}

export type SceneEvent =
  | { type: 'SCENE_READY' }
  | { type: 'RUN_UP_STARTED' }
  | { type: 'BALL_RELEASE'; hand: Vec3 }
  | { type: 'BALL_PITCH' }
  | { type: 'BALL_NEAR_BATTER' }
  | { type: 'CONTACT_PRESENTATION' }
  | { type: 'RESULT' }
  | { type: 'SCORE_UPDATE' }
  | { type: 'SEQUENCE_COMPLETE' }
  | { type: 'TARGET_CHANGED'; target: NormalizedTarget }
  | { type: 'ASSET_WARNING'; message: string }
  | { type: 'FPS_SAMPLE'; fps: number }
  // ---- batting -----------------------------------------------------------------------------------
  /** The AI bowler has released: when the ball pitches and reaches the bat, on the presentation clock. */
  | {
      type: 'BALL_TIMELINE';
      pitchTime: number;
      contactTime: number;
      speedKmh: number;
    }
  /** The player tapped the pitch to swing; `at` is already on the presentation clock. */
  | { type: 'SWING_INPUT'; at: number }
  | { type: 'SHOT_COMMITTED' }
  | { type: 'CONTACT_WINDOW' }
  | { type: 'BAT_CONTACT'; made: boolean; quality: string }
  | { type: 'BALL_EXIT' }
  /** No swing was made and the ball has gone by. */
  | { type: 'LATE_CUTOFF' };

/** The parts of a delivery result the scene draws; the dev lab supplies the same three. */
export type FlightInput = Pick<
  DeliveryResultDto,
  'delivery' | 'shot' | 'outcome'
>;

/** What the controller asks of the scene. The Phaser scene implements it; tests use a fake. */
export interface ScenePort {
  prepare(info: SceneMatchInfo): void;
  setTarget(target: NormalizedTarget, visible: boolean): void;
  startRunUp(): void;
  cancelRunUp(): void;
  /** Called once the ball is released with the server's result. */
  beginFlight(result: FlightInput): void;
  /** Jump straight to the end of the presentation (player pressed Skip). */
  skip(): void;
  /** Return to the pre-delivery stance. */
  reset(): void;
  setPaused(paused: boolean): void;

  // ---- batting (the AI bowls; the player reads, chooses and times a shot) ------------------------
  /** The AI bowler runs in and releases. With `replay`, the swing is re-played automatically (after a retry). */
  startDelivery(
    preview: DeliveryPreviewDto,
    replay?: {
      shotId: string;
      errorSeconds: number;
      result: DeliveryResultDto;
    },
  ): void;
  /** The player committed a shot: the batter's swing begins NOW (before the server has answered). */
  startSwing(shotId: string, startAt?: number): void;
  /** The server's answer: contact assist, the ball's exit and the result sequence follow from it. */
  applyShotResult(result: DeliveryResultDto): void;
  /** Seconds since release on the same clock the ball and the swing use, for timing a tap; null before release. */
  presentationTime(): number | null;
  /** Fast presentation: the part after contact plays faster (optional; useful in short formats). */
  setFast(fast: boolean): void;

  // ---- development tools (the batting lab) ---------------------------------------------------------
  /** Scale the scene's clock: 1 is normal, 0.1 is slow motion. Never used in a real match. */
  setTimeScale(scale: number): void;
  /** While paused, advance the scene by exactly this many seconds (frame stepping). */
  step(seconds: number): void;
}

export type SceneEventHandler = (event: SceneEvent) => boolean | void;
