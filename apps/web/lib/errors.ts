import type { Translator } from '@mastermind/shared';
import { ApiError } from './api';

type ErrorContext = 'login' | 'register' | 'generic';

/** Turns any thrown value into a localized, user-facing message. */
export function errorMessage(error: unknown, t: Translator, context: ErrorContext = 'generic'): string {
  if (error instanceof ApiError) {
    if (error.isNetwork) return t('errors.serverUnavailable');
    const field =
      error.details && typeof error.details === 'object'
        ? (error.details as Record<string, unknown>).field
        : undefined;
    switch (error.status) {
      case 400:
        return t('errors.validation');
      case 401:
        return context === 'login' ? t('auth.invalidCredentials') : t('errors.unauthorized');
      case 403:
        return t('errors.forbidden');
      case 404:
        return t('errors.notFound');
      case 409:
        if (context === 'register') {
          if (field === 'username') return t('auth.usernameTaken');
          if (field === 'email') return t('auth.emailTaken');
        }
        return error.message || t('errors.generic');
      case 429:
        return t('errors.rateLimited');
      case 502:
      case 503:
      case 504:
        return t('errors.server');
      default:
        return error.message && error.status < 500 ? error.message : t('errors.generic');
    }
  }
  return t('errors.generic');
}

export function isStatus(error: unknown, ...statuses: number[]): boolean {
  return error instanceof ApiError && statuses.includes(error.status);
}

export function isAuthError(error: unknown): boolean {
  return isStatus(error, 401);
}
