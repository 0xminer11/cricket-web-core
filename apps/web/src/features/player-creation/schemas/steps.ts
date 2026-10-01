import {
  DISPLAY_NAME_RULES,
  checkDisplayName,
  normalizeDisplayName,
} from '@the-cricketer/shared-types';
import type { CreationOptions, PlayerCreationDraft } from '../types';
import { roleOf } from '../utils/draft';

/**
 * Per-step checks for instant feedback. The server validates everything again and is
 * authoritative; these only decide whether Next is enabled and which message to show.
 */
export type StepErrors = Partial<Record<string, string>>;

export function validateIdentity(
  draft: PlayerCreationDraft,
  options: CreationOptions,
): StepErrors {
  const errors: StepErrors = {};
  const name = normalizeDisplayName(draft.displayName);
  const problem = checkDisplayName(name);
  if (problem === 'length')
    errors.displayName = `Use ${DISPLAY_NAME_RULES.minLength} to ${DISPLAY_NAME_RULES.maxLength} characters.`;
  else if (problem === 'characters')
    errors.displayName =
      'Use letters, numbers, spaces, apostrophes, hyphens and full stops only.';
  else if (problem === 'no_letters')
    errors.displayName = 'Include at least one letter.';
  if (!options.countries.all.includes(draft.countryCode))
    errors.countryCode = 'Choose a country.';
  const j = draft.jerseyNumber;
  if (
    j === null ||
    !Number.isInteger(j) ||
    j < options.jerseyRange.min ||
    j > options.jerseyRange.max
  )
    errors.jerseyNumber = `Enter a whole number from ${options.jerseyRange.min} to ${options.jerseyRange.max}.`;
  return errors;
}

export function validateStyle(
  draft: PlayerCreationDraft,
  options: CreationOptions,
): StepErrors {
  const errors: StepErrors = {};
  const role = roleOf(options, draft.primaryRoleId);
  if (!role) errors.primaryRole = 'Choose a role.';
  if (!draft.battingHand || !options.battingHands.includes(draft.battingHand))
    errors.battingHand = 'Choose your batting hand.';
  if (role) {
    if (draft.bowlingStyleId === null) {
      if (role.bowling === 'required')
        errors.bowlingStyle = `${role.name}s need a bowling style.`;
    } else if (!role.allowedBowlingStyles.includes(draft.bowlingStyleId))
      errors.bowlingStyle = 'That bowling style does not suit this role.';
  }
  return errors;
}

export function validateAppearance(draft: PlayerCreationDraft): StepErrors {
  const errors: StepErrors = {};
  for (const [key, value] of Object.entries(draft.appearance))
    if (value === null) errors[key] = 'Choose an option.';
  return errors;
}

export function validatePersonality(draft: PlayerCreationDraft): StepErrors {
  return draft.personalityArchetypeId
    ? {}
    : { personality: 'Choose a personality.' };
}

export const STEP_VALIDATORS = [
  validateIdentity,
  validateStyle,
  (d: PlayerCreationDraft) => validateAppearance(d),
  (d: PlayerCreationDraft) => validatePersonality(d),
  () => ({}) as StepErrors,
] as const;

export const isStepValid = (
  step: number,
  draft: PlayerCreationDraft,
  options: CreationOptions,
): boolean => {
  const validator = STEP_VALIDATORS[step];
  return validator ? Object.keys(validator(draft, options)).length === 0 : true;
};
