import { PITCH } from '../config/visual-config';
import { smoothstep, add3, lerp3 } from './vec';
import type { Vec3 } from './vec';
import type { Exit, IncomingPlan } from './trajectory';

/**
 * The ONE ball entity of a batting delivery. Before the result is known it follows the incoming plan;
 * when the result arrives (before contact) the path is told where contact visually happens and which
 * exit follows, and from then on it is `incoming (with a tiny ramped nudge) -> exit`. At the switch the
 * outgoing path starts exactly at the final contact point, so the ball is never teleported, frozen or
 * duplicated (Module 10 sections 213-215).
 *
 * If the result arrives late (the player did not swing, or the network was slow) the ball keeps going
 * past the plane with the velocity it had, instead of freezing at the bat.
 */
export class BallPath {
  private resolved: {
    contact: Vec3;
    nudge: Vec3;
    switchTime: number;
    contactTime: number;
    exit: Exit;
  } | null = null;

  constructor(readonly incoming: IncomingPlan) {}

  get flightTime(): number {
    return this.incoming.flightTime;
  }
  get isResolved(): boolean {
    return this.resolved !== null;
  }
  /** When the ball leaves the bat (or passes it), on the presentation clock. */
  get contactTime(): number {
    return this.resolved?.contactTime ?? this.incoming.flightTime;
  }
  get duration(): number {
    return this.resolved
      ? this.resolved.contactTime + this.resolved.exit.duration
      : this.incoming.flightTime;
  }

  /** Velocity (m/s on the presentation clock) at the end of the incoming flight, for a late result. */
  private passVelocity(): Vec3 {
    const e = 0.02;
    const a = this.incoming.at(this.incoming.flightTime - e);
    const b = this.incoming.at(this.incoming.flightTime);
    return {
      u: (b.u - a.u) / e,
      v: (b.v - a.v) / e,
      z: Math.min(0, (b.z - a.z) / e),
    };
  }

  /** Position the incoming ball would be at, extending past the plane if the result is not in yet. */
  private incomingAt(t: number): Vec3 {
    if (t <= this.incoming.flightTime) return this.incoming.at(t);
    const v = this.passVelocity();
    const dt = t - this.incoming.flightTime;
    const base = this.incoming.arrival;
    // it keeps travelling and loses height to the ground, never going below it
    return {
      u: base.u + v.u * dt * 0.6,
      v: Math.min(PITCH.length + 3, base.v + v.v * dt * 0.6),
      z: Math.max(0, base.z + v.z * dt * 0.4),
    };
  }

  /**
   * Fix the outcome. `contact` is the visual contact point (the engine's incoming point plus the small
   * presentation nudge, or exactly the incoming point for a miss), `now` is when the result became known and
   * `exitFrom` builds the exit starting at the point where it is taken up.
   */
  resolve(args: {
    contact: Vec3;
    now: number;
    exitFrom: (start: Vec3) => Exit;
  }): void {
    const contactTime = Math.max(this.incoming.flightTime, args.now);
    const natural = this.incomingAt(contactTime);
    const nudge: Vec3 = {
      u: args.contact.u - this.incoming.arrival.u,
      v: args.contact.v - this.incoming.arrival.v,
      z: args.contact.z - this.incoming.arrival.z,
    };
    const late = args.now > this.incoming.flightTime;
    // a late result takes the ball up from where it has got to, with no nudge
    const start = late ? natural : args.contact;
    this.resolved = {
      contact: start,
      nudge: late ? { u: 0, v: 0, z: 0 } : nudge,
      switchTime: Math.min(args.now, this.incoming.flightTime),
      contactTime,
      exit: args.exitFrom(start),
    };
  }

  positionAt(t: number): Vec3 {
    const r = this.resolved;
    if (!r) return this.incomingAt(Math.max(0, t));
    if (t <= r.contactTime) {
      const base = this.incomingAt(Math.max(0, t));
      if (r.contactTime <= r.switchTime + 1e-6) return base;
      // the nudge grows from nothing at the moment the result is known to its full size at contact
      const ramp = smoothstep(
        (t - r.switchTime) / (r.contactTime - r.switchTime),
      );
      return add3(base, lerp3({ u: 0, v: 0, z: 0 }, r.nudge, ramp));
    }
    const s = Math.min(1, (t - r.contactTime) / r.exit.duration);
    return r.exit.at(s);
  }

  /** The time at which the exit first reaches a given distance down the pitch (for stumps), or null. */
  timeAtV(v: number, step = 0.01): number | null {
    for (let t = 0; t <= this.duration; t += step)
      if (this.positionAt(t).v >= v) return t;
    return null;
  }
}
