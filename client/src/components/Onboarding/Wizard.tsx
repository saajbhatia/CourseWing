import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AxiosError } from 'axios';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Input, Button, Spinner, GoogleIcon, useToastContext } from '@librechat/client';
import {
  Link2,
  Loader2,
  BookOpen,
  ArrowLeft,
  ExternalLink,
  GraduationCap,
  ShieldCheck,
  CheckCircle2,
  TriangleAlert,
} from 'lucide-react';
import {
  useDemoModeMutation,
  useCanvasConnectionQuery,
  useConnectCanvasMutation,
  useCurrentCoursesQuery,
  useCanvasSchoolSearchQuery,
  useConnectGoogleClassroomMutation,
} from '~/data-provider/CourseWing';
import type { CanvasSchool } from '~/data-provider/CourseWing';
import { useLocalize, useAuthContext } from '~/hooks';
import { markOnboarded } from './state';
import CanvasIcon from './CanvasIcon';

type Step = 'welcome' | 'connect' | 'canvas' | 'sync';

const DOT_STEPS = ['welcome', 'connect', 'sync'] as const;

const FAILED_OUTCOMES = new Set(['denied', 'error', 'invalid', 'retry']);

function initialStep(outcome: string | null): Step {
  if (outcome === 'connected' || outcome === 'connected_pending_cleanup') {
    return 'sync';
  }
  if (outcome != null && FAILED_OUTCOMES.has(outcome)) {
    return 'connect';
  }
  return 'welcome';
}

/** Deep link to Canvas's token page; the text fragment scrolls to and highlights the "New Access Token" button. */
function canvasTokenUrl(domain: string): string {
  const host = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return `https://${host}/profile/settings#:~:text=New%20Access%20Token`;
}

/** A pasted Canvas web address in the search box becomes a selectable option, replacing a manual-entry field. */
function domainCandidate(query: string): string | null {
  const host = query
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');
  return /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(host) ? host : null;
}

function connectErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof AxiosError) {
    const serverMessage = (error.response?.data as { message?: string } | undefined)?.message;
    if (serverMessage) {
      return serverMessage;
    }
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

function ValueRow({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 text-left">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-tertiary text-text-primary">
        {icon}
      </div>
      <div className="flex flex-col">
        <span className="text-sm font-medium text-text-primary">{title}</span>
        <span className="text-sm text-text-secondary">{description}</span>
      </div>
    </div>
  );
}

function StepDots({ step }: { step: Step }) {
  const activeIndex = step === 'canvas' ? 1 : DOT_STEPS.indexOf(step as (typeof DOT_STEPS)[number]);
  return (
    <div className="flex items-center gap-1.5" aria-hidden="true">
      {DOT_STEPS.map((name, index) => (
        <span
          key={name}
          className={`h-1.5 rounded-full transition-all duration-300 ${
            index === activeIndex ? 'w-6 bg-text-primary' : 'w-1.5 bg-border-heavy'
          }`}
        />
      ))}
    </div>
  );
}

export default function Wizard() {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { showToast } = useToastContext();
  const [searchParams] = useSearchParams();
  const { user, isAuthenticated, isGuest } = useAuthContext();

  const outcome = searchParams.get('classroom');
  const [step, setStep] = useState<Step>(() => initialStep(outcome));
  const [token, setToken] = useState('');
  const [school, setSchool] = useState<CanvasSchool | null>(null);
  const [schoolQuery, setSchoolQuery] = useState('');
  const [debouncedSchoolQuery, setDebouncedSchoolQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSchoolQuery(schoolQuery), 300);
    return () => clearTimeout(timer);
  }, [schoolQuery]);
  const schoolSearch = useCanvasSchoolSearchQuery(debouncedSchoolQuery);

  const connection = useCanvasConnectionQuery({ enabled: isAuthenticated && !isGuest });
  const courses = useCurrentCoursesQuery();
  const connectMutation = useConnectCanvasMutation();
  const googleMutation = useConnectGoogleClassroomMutation();
  const demoMutation = useDemoModeMutation();

  const failedOutcomeToasted = useRef(false);
  useEffect(() => {
    if (outcome == null || !FAILED_OUTCOMES.has(outcome) || failedOutcomeToasted.current) {
      return;
    }
    failedOutcomeToasted.current = true;
    showToast({
      status: 'error',
      message: localize(
        outcome === 'denied' ? 'com_ui_onboarding_google_denied' : 'com_ui_classroom_connect_error',
      ),
    });
  }, [outcome, showToast, localize]);

  const data = connection.data;
  const syncDone = data?.connected === true && data.syncing !== true && data.lastSyncAt != null;
  const syncFailed =
    data?.connected === true &&
    data.syncing !== true &&
    data.lastSyncAt == null &&
    Boolean(data.lastSyncError);

  useEffect(() => {
    if (step !== 'sync' || syncDone || syncFailed) {
      return;
    }
    const timer = setInterval(() => {
      void connection.refetch();
    }, 3000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, syncDone, syncFailed]);

  if (isGuest) {
    return <Navigate to="/c/new" replace={true} />;
  }
  if (!isAuthenticated) {
    return null;
  }
  if (data?.enabled === false) {
    return <Navigate to="/c/new" replace={true} />;
  }

  const finish = () => {
    markOnboarded(user?.id);
    navigate('/c/new', { replace: true });
  };

  const handleGoogleConnect = () => {
    googleMutation.mutate(undefined, {
      onError: (error) => {
        showToast({
          status: 'error',
          message: connectErrorMessage(error, localize('com_ui_classroom_connect_error')),
        });
      },
    });
  };

  const canvasBaseUrl = school?.domain ?? '';
  const canConnectCanvas = token.trim().length > 0 && canvasBaseUrl.length > 0;

  const handleCanvasConnect = () => {
    if (!canConnectCanvas) {
      return;
    }
    connectMutation.mutate(
      { token: token.trim(), baseUrl: canvasBaseUrl },
      {
        onSuccess: () => {
          setToken('');
          setStep('sync');
        },
        onError: (error) => {
          showToast({
            status: 'error',
            message: connectErrorMessage(error, localize('com_ui_canvas_connect_error')),
          });
        },
      },
    );
  };

  const alreadyConnected = data?.connected === true;

  /** Skip still shows a fully-populated product: attach the shared demo dataset, fall back to a bare skip. */
  const handleSkip = () => {
    if (alreadyConnected) {
      finish();
      return;
    }
    if (demoMutation.isLoading) {
      return;
    }
    demoMutation.mutate(undefined, {
      onSuccess: () => {
        markOnboarded(user?.id);
        setStep('sync');
      },
      onError: finish,
    });
  };

  const skipLink = (
    <button
      type="button"
      onClick={handleSkip}
      disabled={demoMutation.isLoading}
      className="mt-6 flex items-center gap-2 text-sm text-text-secondary underline-offset-4 hover:text-text-primary hover:underline disabled:opacity-60"
    >
      {demoMutation.isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
      {alreadyConnected
        ? localize('com_ui_onboarding_skip_plain')
        : localize('com_ui_onboarding_skip')}
    </button>
  );

  const welcomeStep = (
    <>
      <h1 className="text-2xl font-semibold text-text-primary sm:text-3xl">
        {localize('com_ui_onboarding_welcome_title')}
      </h1>
      <p className="mt-2 text-sm text-text-secondary sm:text-base">
        {localize('com_ui_onboarding_welcome_subtitle')}
      </p>
      <div className="mt-8 flex w-full flex-col gap-5">
        <ValueRow
          icon={<BookOpen className="h-5 w-5" aria-hidden="true" />}
          title={localize('com_ui_onboarding_value_classes_title')}
          description={localize('com_ui_onboarding_value_classes_desc')}
        />
        <ValueRow
          icon={<GraduationCap className="h-5 w-5" aria-hidden="true" />}
          title={localize('com_ui_onboarding_value_learning_title')}
          description={localize('com_ui_onboarding_value_learning_desc')}
        />
        <ValueRow
          icon={<ShieldCheck className="h-5 w-5" aria-hidden="true" />}
          title={localize('com_ui_onboarding_value_receipts_title')}
          description={localize('com_ui_onboarding_value_receipts_desc')}
        />
      </div>
      <Button
        className="mt-8 w-full"
        onClick={() => setStep(alreadyConnected ? 'sync' : 'connect')}
      >
        {localize('com_ui_onboarding_get_started')}
      </Button>
      {skipLink}
    </>
  );

  const providerButtonClass =
    'flex w-full items-center justify-center gap-3 rounded-2xl border border-border-light bg-surface-primary px-5 py-3.5 text-sm font-medium text-text-primary transition-colors duration-200 hover:bg-surface-tertiary disabled:cursor-not-allowed disabled:opacity-60';

  const connectStep = (
    <>
      <h1 className="text-2xl font-semibold text-text-primary">
        {localize('com_ui_onboarding_connect_title')}
      </h1>
      <p className="mt-2 text-sm text-text-secondary">
        {localize('com_ui_onboarding_connect_subtitle')}
      </p>
      <div className="mt-8 flex w-full flex-col gap-3">
        <button
          type="button"
          onClick={handleGoogleConnect}
          disabled={googleMutation.isLoading}
          className={providerButtonClass}
        >
          {googleMutation.isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          ) : (
            <GoogleIcon />
          )}
          {localize('com_ui_classroom_connect')}
        </button>
        <button type="button" onClick={() => setStep('canvas')} className={providerButtonClass}>
          <CanvasIcon />
          {localize('com_ui_onboarding_connect_canvas')}
        </button>
      </div>
      {skipLink}
    </>
  );

  const searchResults = schoolSearch.data ?? [];
  const pastedDomain = domainCandidate(debouncedSchoolQuery);
  const searchActive = debouncedSchoolQuery.trim().length >= 3;

  const canvasStep = (
    <>
      <h1 className="text-2xl font-semibold text-text-primary">
        {localize('com_ui_onboarding_connect_canvas')}
      </h1>
      <p className="mt-2 text-sm text-text-secondary">
        {localize('com_ui_onboarding_canvas_desc')}
      </p>
      <div className="mt-6 flex w-full flex-col gap-3 text-left">
        {school == null && (
          <div className="flex flex-col gap-2">
            <Input
              type="text"
              value={schoolQuery}
              onChange={(event) => setSchoolQuery(event.target.value)}
              placeholder={localize('com_ui_onboarding_school_search')}
              className="h-10"
              aria-label={localize('com_ui_onboarding_school_search')}
            />
            {searchActive && (searchResults.length > 0 || pastedDomain != null) && (
              <div className="flex max-h-56 flex-col overflow-y-auto rounded-lg border border-border-light">
                {pastedDomain != null && (
                  <button
                    type="button"
                    onClick={() => setSchool({ id: 0, name: pastedDomain, domain: pastedDomain })}
                    className="flex flex-col border-b border-border-light px-3 py-2 text-left last:border-b-0 hover:bg-surface-tertiary"
                  >
                    <span className="text-sm text-text-primary">
                      {localize('com_ui_onboarding_school_use_domain', { 0: pastedDomain })}
                    </span>
                  </button>
                )}
                {searchResults.map((result) => (
                  <button
                    key={result.id}
                    type="button"
                    onClick={() => setSchool(result)}
                    className="flex flex-col border-b border-border-light px-3 py-2 text-left last:border-b-0 hover:bg-surface-tertiary"
                  >
                    <span className="text-sm text-text-primary">{result.name}</span>
                    <span className="text-xs text-text-secondary">{result.domain}</span>
                  </button>
                ))}
              </div>
            )}
            {searchActive &&
              !schoolSearch.isFetching &&
              searchResults.length === 0 &&
              pastedDomain == null && (
                <div className="flex flex-col gap-1 rounded-lg border border-border-light bg-surface-secondary px-3 py-2 text-xs text-text-secondary">
                  <span className="font-medium text-text-primary">
                    {localize('com_ui_onboarding_school_none_title')}
                  </span>
                  <ul className="list-disc space-y-0.5 pl-4">
                    <li>{localize('com_ui_onboarding_school_none_tip1')}</li>
                    <li>{localize('com_ui_onboarding_school_none_tip2')}</li>
                    <li>{localize('com_ui_onboarding_school_none_tip3')}</li>
                  </ul>
                </div>
              )}
          </div>
        )}
        {school != null && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-border-light px-3 py-2">
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm text-text-primary">{school.name}</span>
              {school.name !== school.domain && (
                <span className="truncate text-xs text-text-secondary">{school.domain}</span>
              )}
            </div>
            <Button size="sm" variant="outline" onClick={() => setSchool(null)}>
              {localize('com_ui_onboarding_school_change')}
            </Button>
          </div>
        )}
        {canvasBaseUrl.length > 0 && (
          <a
            href={canvasTokenUrl(canvasBaseUrl)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-lg border border-border-medium px-3 py-2 text-sm text-text-primary hover:bg-surface-tertiary"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            {localize('com_ui_onboarding_canvas_open_settings')}
          </a>
        )}
        {school != null && (
          <div className="flex items-center gap-2">
            <Input
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder={localize('com_ui_canvas_token_placeholder')}
              className="h-9 flex-1"
              aria-label={localize('com_ui_canvas_token_placeholder')}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  handleCanvasConnect();
                }
              }}
            />
            <Button
              size="sm"
              onClick={handleCanvasConnect}
              disabled={!canConnectCanvas || connectMutation.isLoading}
              aria-label={localize('com_ui_canvas_connect')}
            >
              {connectMutation.isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Link2 className="h-4 w-4" aria-hidden="true" />
              )}
              {localize('com_ui_canvas_connect')}
            </Button>
          </div>
        )}
        {school != null && (
          <details className="text-sm">
            <summary className="cursor-pointer text-text-secondary hover:text-text-primary">
              {localize('com_ui_onboarding_canvas_help_title')}
            </summary>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-text-secondary">
              <li>{localize('com_ui_onboarding_canvas_help_step1')}</li>
              <li>{localize('com_ui_onboarding_canvas_help_step2')}</li>
              <li>{localize('com_ui_onboarding_canvas_help_step3')}</li>
              <li>{localize('com_ui_onboarding_canvas_help_step4')}</li>
            </ol>
          </details>
        )}
      </div>
      <button
        type="button"
        onClick={() => setStep('connect')}
        className="mt-6 flex items-center gap-1 text-sm text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {localize('com_ui_onboarding_back')}
      </button>
    </>
  );

  const courseNames = (courses.data ?? []).map((course) => course.name);

  const syncStep = syncFailed ? (
    <>
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-tertiary">
        <TriangleAlert className="h-6 w-6 text-amber-500" aria-hidden="true" />
      </div>
      <h1 className="mt-4 text-2xl font-semibold text-text-primary">
        {localize('com_ui_onboarding_sync_error_title')}
      </h1>
      <p className="mt-2 max-w-md text-sm text-text-secondary">
        {localize('com_ui_onboarding_sync_error_desc')}
      </p>
      <Button className="mt-8 w-full" onClick={() => setStep('connect')}>
        {localize('com_ui_onboarding_try_again')}
      </Button>
      <button
        type="button"
        onClick={finish}
        className="mt-4 text-sm text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
      >
        {localize('com_ui_onboarding_continue_anyway')}
      </button>
    </>
  ) : (
    <>
      {syncDone ? (
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-tertiary">
          <CheckCircle2 className="h-6 w-6 text-green-500" aria-hidden="true" />
        </div>
      ) : (
        <Spinner className="h-8 w-8 text-text-primary" />
      )}
      <h1 className="mt-4 text-2xl font-semibold text-text-primary">
        {syncDone
          ? localize('com_ui_onboarding_sync_done_title')
          : localize('com_ui_onboarding_sync_title')}
      </h1>
      <p className="mt-2 text-sm text-text-secondary">
        {syncDone
          ? localize('com_ui_onboarding_sync_done_subtitle', {
              0: String(courseNames.length > 0 ? courseNames.length : (data?.courseCount ?? 0)),
            })
          : localize('com_ui_onboarding_sync_subtitle')}
      </p>
      {courseNames.length > 0 && (
        <div className="mt-6 flex max-w-md flex-wrap items-center justify-center gap-2">
          {courseNames.map((name) => (
            <span
              key={name}
              className="animate-fadeIn rounded-full border border-border-light bg-surface-primary px-3 py-1 text-sm text-text-primary"
            >
              {name}
            </span>
          ))}
        </div>
      )}
      {(syncDone || courseNames.length > 0) && (
        <Button className="mt-8 w-full" onClick={finish}>
          {localize('com_ui_onboarding_start_chatting')}
        </Button>
      )}
      {!syncDone && courseNames.length === 0 && (
        <button
          type="button"
          onClick={finish}
          className="mt-8 text-sm text-text-secondary underline-offset-4 hover:text-text-primary hover:underline"
        >
          {localize('com_ui_onboarding_skip')}
        </button>
      )}
    </>
  );

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-surface-secondary px-4 py-10">
      <div className="flex w-full max-w-lg flex-col items-center rounded-2xl border border-border-light bg-surface-primary-alt p-8 text-center shadow-sm sm:p-10">
        <div className="mb-8 flex w-full items-center justify-between">
          <span className="text-sm font-semibold tracking-wide text-text-primary">CourseWing</span>
          <StepDots step={step} />
        </div>
        {step === 'welcome' && welcomeStep}
        {step === 'connect' && connectStep}
        {step === 'canvas' && canvasStep}
        {step === 'sync' && syncStep}
      </div>
    </main>
  );
}
