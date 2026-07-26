/* eslint-disable i18next/no-literal-string */
import { useForm } from 'react-hook-form';
import React, { useContext, useEffect, useRef, useState } from 'react';
import { Turnstile } from '@marsidev/react-turnstile';
import { ThemeContext, SecretInput, Spinner, Button, isDark } from '@librechat/client';
import { useNavigate, useOutletContext, useLocation } from 'react-router-dom';
import { useRegisterUserMutation } from 'librechat-data-provider/react-query';
import { joinCourseFromInvitation, loginPage } from 'librechat-data-provider';
import type { TRegisterUser, TError } from 'librechat-data-provider';
import type { TLoginLayoutContext } from '~/common';
import { useLocalize, TranslationKeys } from '~/hooks';
import { ErrorMessage } from './ErrorMessage';

const Registration: React.FC = () => {
  const navigate = useNavigate();
  const localize = useLocalize();
  const { theme } = useContext(ThemeContext);
  const {
    startupConfig,
    startupConfigError,
    isFetching,
    isAuthenticated = false,
  } = useOutletContext<TLoginLayoutContext>();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const token = queryParams.get('token');
  const invitedEmail = token ? (queryParams.get('email')?.trim().toLowerCase() ?? '') : '';
  const courseName = token ? (queryParams.get('courseName')?.trim() ?? '') : '';
  const courseId = token ? (queryParams.get('course')?.trim() ?? '') : '';
  const invitationPath = `${location.pathname}${location.search}`;
  const loginUrl = token
    ? `${loginPage()}?redirect_to=${encodeURIComponent(invitationPath)}`
    : loginPage();

  const {
    watch,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TRegisterUser>({
    mode: 'onChange',
    defaultValues: invitedEmail ? { email: invitedEmail } : undefined,
  });
  const password = watch('password');

  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [countdown, setCountdown] = useState<number>(3);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const joinAttempted = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || !token || joinAttempted.current) {
      return;
    }
    joinAttempted.current = true;
    setIsSubmitting(true);
    setErrorMessage('');
    void joinCourseFromInvitation(token)
      .then((result) => {
        navigate(`/workspace/courses/${encodeURIComponent(result.courseId)}`, { replace: true });
      })
      .catch((error: TError) => {
        setErrorMessage(
          error.response?.data?.message ?? 'The course invitation could not be claimed.',
        );
      })
      .finally(() => setIsSubmitting(false));
  }, [isAuthenticated, navigate, token]);

  const validTheme = isDark(theme) ? 'dark' : 'light';

  // only require captcha if we have a siteKey
  const requireCaptcha = Boolean(startupConfig?.turnstile?.siteKey);
  const authInputClassName =
    'webkit-dark-styles transition-color peer w-full rounded-2xl border border-border-light bg-surface-primary px-3.5 pb-2.5 pt-3 text-text-primary duration-200 hover:border-border-light focus:border-green-500 focus:outline-none focus-visible:border-green-500';
  const authSecretInputClassName = `${authInputClassName} h-auto pr-12`;
  const authLabelClassName =
    'absolute start-3 top-1.5 z-10 origin-[0] -translate-y-4 scale-75 transform bg-surface-primary px-2 text-sm text-text-secondary-alt duration-200 peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:scale-100 peer-focus:top-1.5 peer-focus:-translate-y-4 peer-focus:scale-75 peer-focus:px-2 peer-focus:text-green-500 rtl:peer-focus:left-auto rtl:peer-focus:translate-x-1/4';
  const authSecretButtonClassName =
    'size-9 rounded-xl text-text-secondary-alt hover:bg-transparent hover:text-text-primary';

  const registerUser = useRegisterUserMutation({
    onMutate: () => {
      setIsSubmitting(true);
    },
    onSuccess: () => {
      setIsSubmitting(false);
      setCountdown(3);
      const timer = setInterval(() => {
        setCountdown((prevCountdown) => {
          if (prevCountdown <= 1) {
            clearInterval(timer);
            const destination = courseId
              ? `/workspace/courses/${encodeURIComponent(courseId)}`
              : '/c/new';
            navigate(`${loginPage()}?redirect_to=${encodeURIComponent(destination)}`, {
              replace: true,
            });
            return 0;
          } else {
            return prevCountdown - 1;
          }
        });
      }, 1000);
    },
    onError: (error: unknown) => {
      setIsSubmitting(false);
      if ((error as TError).response?.data?.message) {
        setErrorMessage((error as TError).response?.data?.message ?? '');
      }
    },
  });

  if (isAuthenticated && token) {
    return (
      <>
        {errorMessage ? (
          <ErrorMessage>
            {localize('com_auth_error_create')} {errorMessage}
          </ErrorMessage>
        ) : (
          <div
            className="flex items-center justify-center gap-2 rounded-xl border border-border-light bg-surface-secondary px-3.5 py-4 text-sm text-text-secondary"
            role="status"
          >
            <Spinner className="size-4" />
            <span>{isSubmitting ? 'Joining course…' : 'Opening course…'}</span>
          </div>
        )}
      </>
    );
  }

  const renderInput = (id: string, label: TranslationKeys, type: string, validation: object) => {
    const fieldLabel = localize(label);
    const field = register(
      id as 'name' | 'email' | 'username' | 'password' | 'confirm_password',
      validation,
    );

    return (
      <div className="mb-4">
        <div className="relative">
          {type === 'password' ? (
            <SecretInput
              id={id}
              autoComplete={id}
              aria-label={fieldLabel}
              {...field}
              aria-invalid={!!errors[id]}
              className={authSecretInputClassName}
              placeholder=" "
              data-testid={id}
              label={fieldLabel}
              labelClassName={authLabelClassName}
              controlsClassName="right-2"
              buttonClassName={authSecretButtonClassName}
            />
          ) : (
            <>
              <input
                id={id}
                type={type}
                autoComplete={id}
                aria-label={fieldLabel}
                {...field}
                readOnly={id === 'email' && Boolean(invitedEmail)}
                aria-invalid={!!errors[id]}
                className={authInputClassName}
                placeholder=" "
                data-testid={id}
              />
              <label htmlFor={id} className={authLabelClassName}>
                {fieldLabel}
              </label>
            </>
          )}
        </div>
        {errors[id] && (
          <span role="alert" className="mt-1 text-sm text-red-500">
            {String(errors[id]?.message) ?? ''}
          </span>
        )}
      </div>
    );
  };

  return (
    <>
      {errorMessage && (
        <ErrorMessage>
          {localize('com_auth_error_create')} {errorMessage}
        </ErrorMessage>
      )}
      {registerUser.isSuccess && countdown > 0 && (
        <div
          className="rounded-md border border-green-500 bg-green-500/10 px-3 py-2 text-sm text-gray-600 dark:text-gray-200"
          role="alert"
        >
          {localize(
            startupConfig?.emailEnabled
              ? 'com_auth_registration_success_generic'
              : 'com_auth_registration_success_insecure',
          ) +
            ' ' +
            localize('com_auth_email_verification_redirecting', { 0: countdown.toString() })}
        </div>
      )}
      {token && (courseName || invitedEmail) ? (
        <div
          className="mt-4 rounded-xl border border-border-light bg-surface-secondary px-3.5 py-3 text-sm text-text-secondary"
          role="status"
        >
          <span className="font-medium text-text-primary">
            {courseName ? `Join ${courseName}` : 'Course invitation'}
          </span>
          <span className="mt-1 block">
            Create your account
            {invitedEmail ? ` with ${invitedEmail}` : ''} to join the course.
          </span>
        </div>
      ) : null}
      {!startupConfigError && !isFetching && (
        <>
          <form
            className="mt-6"
            aria-label="Registration form"
            method="POST"
            onSubmit={handleSubmit((data: TRegisterUser) =>
              registerUser.mutate({ ...data, token: token ?? undefined }),
            )}
          >
            {renderInput('name', 'com_auth_full_name', 'text', {
              required: localize('com_auth_name_required'),
              minLength: {
                value: 3,
                message: localize('com_auth_name_min_length'),
              },
              maxLength: {
                value: 80,
                message: localize('com_auth_name_max_length'),
              },
            })}
            {renderInput('username', 'com_auth_username', 'text', {
              minLength: {
                value: 2,
                message: localize('com_auth_username_min_length'),
              },
              maxLength: {
                value: 80,
                message: localize('com_auth_username_max_length'),
              },
            })}
            {renderInput('email', 'com_auth_email', 'email', {
              required: localize('com_auth_email_required'),
              minLength: {
                value: 1,
                message: localize('com_auth_email_min_length'),
              },
              maxLength: {
                value: 120,
                message: localize('com_auth_email_max_length'),
              },
              pattern: {
                value: /\S+@\S+\.\S+/,
                message: localize('com_auth_email_pattern'),
              },
            })}
            {renderInput('password', 'com_auth_password', 'password', {
              required: localize('com_auth_password_required'),
              minLength: {
                value: startupConfig?.minPasswordLength || 8,
                message: localize('com_auth_password_min_length'),
              },
              maxLength: {
                value: 128,
                message: localize('com_auth_password_max_length'),
              },
            })}
            {renderInput('confirm_password', 'com_auth_password_confirm', 'password', {
              validate: (value: string) =>
                value === password || localize('com_auth_password_not_match'),
            })}

            {startupConfig?.turnstile?.siteKey && (
              <div className="my-4 flex justify-center">
                <Turnstile
                  siteKey={startupConfig.turnstile.siteKey}
                  options={{
                    ...startupConfig.turnstile.options,
                    theme: validTheme,
                  }}
                  onSuccess={(token) => setTurnstileToken(token)}
                  onError={() => setTurnstileToken(null)}
                  onExpire={() => setTurnstileToken(null)}
                />
              </div>
            )}

            <div className="mt-6">
              <Button
                disabled={
                  Object.keys(errors).length > 0 ||
                  isSubmitting ||
                  (requireCaptcha && !turnstileToken)
                }
                type="submit"
                aria-label="Submit registration"
                variant="submit"
                className="h-12 w-full rounded-2xl"
              >
                {isSubmitting ? <Spinner /> : localize('com_auth_continue')}
              </Button>
            </div>
          </form>

          <p className="my-4 text-center text-sm font-light text-gray-700 dark:text-white">
            {localize('com_auth_already_have_account')}{' '}
            <a
              href={loginUrl}
              aria-label="Login"
              className="inline-flex p-1 text-sm font-medium text-green-600 transition-colors hover:text-green-700 dark:text-green-400 dark:hover:text-green-300"
            >
              {localize('com_auth_login')}
            </a>
          </p>
        </>
      )}
    </>
  );
};

export default Registration;
