import { DELIVERIES } from '../../seed/deliveries.seed';
import { SHOTS } from '../../seed/shots.seed';
import { BOWLING_STYLE_WEIGHTS } from '../../config/bowling.config';
import { AI_TUNING } from './tuning';
import { PLAN_TEMPLATES } from './plans';
import { AI_DIFFICULTY_PROFILES } from '../difficulty/profiles';

/** Static checks of the AI configuration. Returns a list of problems (empty = valid). Run by the tests and by tooling. */
export function validateAIConfig(): string[] {
  const errors: string[] = [];
  const finite = (path: string, v: unknown): void => {
    if (typeof v === 'number' && !Number.isFinite(v)) errors.push(`${path} is not finite`);
    else if (v && typeof v === 'object')
      for (const [k, x] of Object.entries(v as Record<string, unknown>))
        finite(`${path}.${k}`, x);
  };
  finite('tuning', AI_TUNING);
  finite('profiles', AI_DIFFICULTY_PROFILES);
  finite('plans', PLAN_TEMPLATES);

  for (const [id, p] of Object.entries(AI_DIFFICULTY_PROFILES)) {
    for (const key of [
      'decisionNoise',
      'adaptationStrength',
      'matchupAwareness',
      'riskAwareness',
      'memoryAccuracy',
      'perceptionAccuracy',
      'mistakeRate',
    ] as const)
      if (p[key] < 0 || p[key] > 1) errors.push(`${id}.${key} must be 0..1`);
    if (p.temperature <= 0) errors.push(`${id}.temperature must be positive`);
    if (!Number.isInteger(p.memoryWindow) || p.memoryWindow < 1)
      errors.push(`${id}.memoryWindow must be a positive integer`);
  }
  const ids = Object.keys(AI_DIFFICULTY_PROFILES);
  for (const [tier, id] of Object.entries(AI_TUNING.tierDifficulty))
    if (!ids.includes(id)) errors.push(`tier ${tier} maps to unknown difficulty ${id}`);
  for (const key of ['teammateDifficulty', 'defaultDifficulty'] as const)
    if (!ids.includes(AI_TUNING[key])) errors.push(`${key} is not a difficulty`);

  const shotIds = new Set<string>(SHOTS.map((s) => s.id));
  for (const id of AI_TUNING.batting.tailenderExcludes)
    if (!shotIds.has(id)) errors.push(`tailenderExcludes: unknown shot ${id}`);
  for (const category of Object.keys(AI_TUNING.batting.strengthAffinity)) {
    const w = AI_TUNING.batting.strengthAffinity[category]!;
    const total = Object.values(w).reduce((a, b) => a + b, 0);
    if (Math.abs(total - 1) > 1e-6) errors.push(`strengthAffinity.${category} must sum to 1`);
  }

  const deliveryIds = new Set<string>(DELIVERIES.map((d) => d.id));
  const styles = Object.keys(BOWLING_STYLE_WEIGHTS);
  const phaseOk = ['early', 'middle', 'death'];
  for (const t of PLAN_TEMPLATES) {
    for (const id of t.ids ?? [])
      if (!deliveryIds.has(id)) errors.push(`plan ${t.id}: unknown delivery ${id}`);
    for (const ph of t.phases ?? [])
      if (!phaseOk.includes(ph)) errors.push(`plan ${t.id}: unknown phase ${ph}`);
    if (t.cells.length === 0) errors.push(`plan ${t.id}: no cells`);
    for (const c of t.cells)
      if (c.x < 0 || c.x > 1 || c.y < 0 || c.y > 1 || c.weight <= 0)
        errors.push(`plan ${t.id}: invalid cell`);
  }
  for (const style of styles) {
    const spin = BOWLING_STYLE_WEIGHTS[style as keyof typeof BOWLING_STYLE_WEIGHTS].spin > 0;
    const usable = PLAN_TEMPLATES.filter(
      (t) => (t.kind === 'any' || (t.kind === 'spin') === spin) && (!t.ids || DELIVERIES.some((d) => t.ids!.includes(d.id) && d.eligibleStyles.includes(style))),
    );
    if (usable.length === 0) errors.push(`no plan template is usable by ${style}`);
  }
  for (const mode of Object.keys(AI_TUNING.bowling.objectiveFit)) {
    const row = AI_TUNING.bowling.objectiveFit[mode]!;
    for (const objective of ['DOT_PRESSURE', 'WICKET_ATTACK', 'BOUNDARY_PREVENTION', 'YORKER_DEATH', 'SHORT_BALL_ATTACK', 'SPIN_PRESSURE'])
      if (!(objective in row)) errors.push(`objectiveFit.${mode} missing ${objective}`);
  }
  return errors;
}
