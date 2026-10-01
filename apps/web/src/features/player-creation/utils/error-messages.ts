import { ApiClientError } from '../../../services/api';
import { describeAuthError } from '../../auth/utils/error-messages';

const MESSAGES: Record<string, string> = {
  CRICKETER_ALREADY_EXISTS: 'You already have a cricketer.',
  INVALID_PLAYER_NAME: 'That name cannot be used. Try a different one.',
  INVALID_COUNTRY: 'Choose a valid country.',
  INVALID_JERSEY_NUMBER: 'Choose a jersey number from 0 to 99.',
  INVALID_PLAYER_ROLE: 'That role is not available.',
  INVALID_BATTING_HAND: 'Choose your batting hand.',
  INVALID_BOWLING_STYLE: 'That bowling style is not available.',
  ROLE_BOWLING_STYLE_MISMATCH:
    'That bowling style does not suit the chosen role.',
  INVALID_APPEARANCE_OPTION: 'One of the appearance options is not available.',
  INVALID_PERSONALITY_ARCHETYPE: 'That personality is not available.',
  CREATION_CONFIG_CHANGED:
    'The available options changed. Review your choices and try again.',
  IDEMPOTENCY_KEY_REUSED:
    'Something went wrong with this request. Reload the page and try again.',
  PLAYER_CREATION_FAILED:
    'We could not create your cricketer. Your choices are saved here: please try again.',
  VALIDATION_ERROR:
    'Some details were not accepted. Please review your choices.',
};

/** Safe, human text for any creation error; unknown codes fall back to the shared auth wording. */
export function describeCreationError(error: unknown): string {
  if (error instanceof ApiClientError && MESSAGES[error.code])
    return MESSAGES[error.code] as string;
  return describeAuthError(error);
}
