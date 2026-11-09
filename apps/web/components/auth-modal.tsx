'use client';

import * as React from 'react';
import { Eye, EyeOff, Loader2, ShieldCheck, UserRound } from 'lucide-react';
import { loginSchema, registerSchema } from '@mastermind/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toaster';
import { DEMO_ADMIN } from '@/lib/config';
import { errorMessage } from '@/lib/errors';
import { useAuth, type AuthMode } from '@/providers/auth-provider';
import { useI18n } from '@/providers/i18n-provider';

type FieldErrors = Partial<Record<'username' | 'email' | 'password', string>>;

export function AuthModal() {
  const { authModalOpen, authModalMode, closeAuthModal } = useAuth();
  return (
    <Dialog open={authModalOpen} onOpenChange={(open) => !open && closeAuthModal()}>
      {authModalOpen && <AuthModalBody key={authModalMode} initialMode={authModalMode} />}
    </Dialog>
  );
}

function AuthModalBody({ initialMode }: { initialMode: AuthMode }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const { login, register, loginAsGuest, switchToDemoAdmin, closeAuthModal } = useAuth();
  const [mode, setMode] = React.useState<AuthMode>(initialMode);
  const [username, setUsername] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [busy, setBusy] = React.useState<null | 'submit' | 'guest' | 'admin'>(null);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});

  const isRegister = mode === 'register';

  const finish = (name: string, kind: 'welcome' | 'guest' | 'admin') => {
    toast({
      title: kind === 'guest' ? t('auth.guestWelcome', { name }) : t('auth.welcome', { name }),
      description: kind === 'admin' ? t('auth.demoAdminActive') : undefined,
      variant: 'success',
    });
    closeAuthModal();
  };

  const validate = (): boolean => {
    const schema = isRegister ? registerSchema : loginSchema;
    const result = schema.safeParse(isRegister ? { username, email, password } : { email, password });
    if (result.success) {
      setFieldErrors({});
      return true;
    }
    const errors: FieldErrors = {};
    for (const issue of result.error.issues) {
      const key = issue.path[0];
      if (key === 'username' || key === 'email' || key === 'password') errors[key] ??= t('errors.validation');
    }
    setFieldErrors(errors);
    return false;
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (!validate()) return;
    setBusy('submit');
    try {
      const user = isRegister
        ? await register({ username: username.trim(), email: email.trim().toLowerCase(), password })
        : await login({ email: email.trim().toLowerCase(), password });
      finish(user.username, 'welcome');
    } catch (error) {
      setFormError(errorMessage(error, t, isRegister ? 'register' : 'login'));
    } finally {
      setBusy(null);
    }
  };

  const onGuest = async () => {
    setFormError(null);
    setBusy('guest');
    try {
      const user = await loginAsGuest();
      finish(user.username, 'guest');
    } catch (error) {
      setFormError(errorMessage(error, t));
    } finally {
      setBusy(null);
    }
  };

  const onDemoAdmin = async () => {
    setFormError(null);
    setBusy('admin');
    try {
      const user = await switchToDemoAdmin();
      finish(user.username, 'admin');
    } catch (error) {
      setFormError(errorMessage(error, t, 'login'));
    } finally {
      setBusy(null);
    }
  };

  const switchMode = () => {
    setMode(isRegister ? 'login' : 'register');
    setFormError(null);
    setFieldErrors({});
  };

  return (
    <DialogContent closeLabel={t('common.close')}>
      <DialogHeader>
        <DialogTitle>{isRegister ? t('auth.registerTitle') : t('auth.loginTitle')}</DialogTitle>
        <DialogDescription>{isRegister ? t('auth.registerSubtitle') : t('auth.loginSubtitle')}</DialogDescription>
      </DialogHeader>

      <form onSubmit={onSubmit} noValidate className="grid gap-4">
        {isRegister && (
          <div className="grid gap-1.5">
            <Label htmlFor="auth-username">{t('auth.username')}</Label>
            <Input
              id="auth-username"
              autoComplete="username"
              autoFocus
              value={username}
              placeholder={t('auth.usernamePlaceholder')}
              onChange={(e) => setUsername(e.target.value)}
              aria-invalid={!!fieldErrors.username}
              aria-describedby={fieldErrors.username ? 'auth-username-error' : undefined}
              maxLength={20}
            />
            {fieldErrors.username && (
              <p id="auth-username-error" className="text-xs text-destructive">
                {t('auth.usernameHint')}
              </p>
            )}
          </div>
        )}
        <div className="grid gap-1.5">
          <Label htmlFor="auth-email">{t('auth.email')}</Label>
          <Input
            id="auth-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoFocus={!isRegister}
            value={email}
            placeholder={t('auth.emailPlaceholder')}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!fieldErrors.email}
            aria-describedby={fieldErrors.email ? 'auth-email-error' : undefined}
          />
          {fieldErrors.email && (
            <p id="auth-email-error" className="text-xs text-destructive">
              {fieldErrors.email}
            </p>
          )}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="auth-password">{t('auth.password')}</Label>
          <div className="relative">
            <Input
              id="auth-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              value={password}
              placeholder={t('auth.passwordPlaceholder')}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!fieldErrors.password}
              aria-describedby={fieldErrors.password ? 'auth-password-error' : undefined}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {fieldErrors.password && (
            <p id="auth-password-error" className="text-xs text-destructive">
              {fieldErrors.password}
            </p>
          )}
        </div>

        {formError && (
          <p role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {formError}
          </p>
        )}

        <Button type="submit" size="lg" disabled={busy !== null}>
          {busy === 'submit' && <Loader2 className="animate-spin" />}
          {isRegister ? t('auth.registerSubmit') : t('auth.loginSubmit')}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        {isRegister ? t('auth.haveAccount') : t('auth.noAccount')}{' '}
        <button type="button" onClick={switchMode} className="font-semibold text-primary underline-offset-4 hover:underline">
          {isRegister ? t('auth.switchToLogin') : t('auth.switchToRegister')}
        </button>
      </p>

      <div className="relative">
        <div className="absolute inset-0 flex items-center" aria-hidden>
          <span className="w-full border-t" />
        </div>
        <span className="relative mx-auto block w-fit bg-background px-3 text-xs uppercase tracking-wide text-muted-foreground">
          {t('common.optional')}
        </span>
      </div>

      <div className="grid gap-2">
        <Button type="button" variant="outline" onClick={onGuest} disabled={busy !== null}>
          {busy === 'guest' ? <Loader2 className="animate-spin" /> : <UserRound />}
          {t('auth.continueAsGuest')}
        </Button>
        <p className="text-center text-xs text-muted-foreground">{t('auth.guestHint')}</p>
        <Button type="button" variant="secondary" onClick={onDemoAdmin} disabled={busy !== null}>
          {busy === 'admin' ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
          {t('auth.switchToDemoAdmin')}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          {t('auth.demoCredentials')} <span className="sr-only">{DEMO_ADMIN.email}</span>
        </p>
      </div>
    </DialogContent>
  );
}
