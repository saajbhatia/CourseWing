import { useEffect, useCallback, useRef } from 'react';
import { useRecoilValue } from 'recoil';
import { useSearchParams } from 'react-router-dom';
import { QueryClient, useQueryClient } from '@tanstack/react-query';
import { QueryKeys, EModelEndpoint, PermissionBits } from 'librechat-data-provider';
import type {
  AgentListResponse,
  TEndpointsConfig,
  TStartupConfig,
  TPreset,
} from 'librechat-data-provider';
import {
  clearModelForNonEphemeralAgent,
  removeUnavailableTools,
  specDisplayFieldReset,
  processValidSettings,
  getModelSpecIconURL,
  getConvoSwitchLogic,
  logger,
} from '~/utils';
import { useAuthContext, useAgentsMap, useDefaultConvo, useSubmitMessage } from '~/hooks';
import { useGetStartupConfig, startupConfigKey, useGetAgentByIdQuery } from '~/data-provider';
import { useChatContext, useChatFormContext } from '~/Providers';
import {
  clearPendingCourse,
  consumeCourseChatHandoff,
  type CourseChatHandoff,
} from '~/components/CourseWing/utils';
import { consumeGuestChatHandoff, type GuestChatHandoff } from '~/utils/guestChatHandoff';
import store from '~/store';

const PROJECT_ID_SEARCH_PARAM = 'projectId';

const injectAgentIntoAgentsMap = (queryClient: QueryClient, agent: any) => {
  const editCacheKey = [QueryKeys.agents, { requiredPermission: PermissionBits.EDIT }];
  const editCache = queryClient.getQueryData<AgentListResponse>(editCacheKey);

  if (editCache?.data && !editCache.data.some((cachedAgent) => cachedAgent.id === agent.id)) {
    // Inject agent into EDIT cache so dropdown can display it
    const updatedCache = {
      ...editCache,
      data: [agent, ...editCache.data],
    };
    queryClient.setQueryData(editCacheKey, updatedCache);
    logger.log('agent', 'Injected URL agent into cache:', agent);
  }
};

/**
 * Hook that processes URL query parameters to initialize chat with specified settings and prompt.
 * Handles model switching, prompt auto-filling, and optional auto-submission with race condition protection.
 * Supports immediate or deferred submission based on whether settings need to be applied first.
 */
export default function useQueryParams({
  textAreaRef,
}: {
  textAreaRef: React.RefObject<HTMLTextAreaElement>;
}) {
  const maxAttempts = 50;
  const attemptsRef = useRef(0);
  /** Hard ceiling on total ticks (including ones spent waiting for the composer/config),
   * so a mount where prerequisites never appear cannot poll forever. */
  const maxWaitAttempts = 600;
  const waitAttemptsRef = useRef(0);
  const MAX_SETTINGS_WAIT_MS = 3000;
  /** Subscribed via the shared hook (not only a raw cache read) so the query is guaranteed
   * to fetch and the auth-scoped cache key always matches — a guest's key differs from
   * `startupConfigKey(isAuthenticated)` while Recoil user state and auth state disagree. */
  const { data: startupConfigData } = useGetStartupConfig();
  const startupConfigRef = useRef<TStartupConfig | undefined>(startupConfigData);
  startupConfigRef.current = startupConfigData;
  const processedRef = useRef(false);
  const lastSearchRef = useRef<string | null>(null);
  const pendingSubmitRef = useRef(false);
  const settingsAppliedRef = useRef(false);
  const submissionHandledRef = useRef(false);
  const promptTextRef = useRef<string | null>(null);
  const validSettingsRef = useRef<TPreset | null>(null);
  const courseHandoffRef = useRef<{ id: string; value: CourseChatHandoff | null } | null>(null);
  const guestHandoffRef = useRef<GuestChatHandoff | null | undefined>(undefined);
  const settingsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const methods = useChatFormContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const getDefaultConversation = useDefaultConvo();
  const modularChat = useRecoilValue(store.modularChat);
  const availableTools = useRecoilValue(store.availableTools);
  const { submitMessage } = useSubmitMessage();

  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuthContext();
  const { conversation, newConversation } = useChatContext();

  const urlAgentId = searchParams.get('agent_id') || '';
  const { data: urlAgent } = useGetAgentByIdQuery(urlAgentId);

  const getPreservedSearchParams = useCallback(() => {
    const preservedParams = new URLSearchParams();
    const projectId = searchParams.get(PROJECT_ID_SEARCH_PARAM);
    if (projectId) {
      preservedParams.set(PROJECT_ID_SEARCH_PARAM, projectId);
    }
    return preservedParams;
  }, [searchParams]);

  const readStartupConfig = useCallback(
    () =>
      startupConfigRef.current ??
      queryClient.getQueryData<TStartupConfig>(startupConfigKey(isAuthenticated)) ??
      queryClient.getQueryData<TStartupConfig>(startupConfigKey(!isAuthenticated)),
    [queryClient, isAuthenticated],
  );

  /**
   * Applies settings from URL query parameters to create a new conversation.
   * Handles model spec lookup, endpoint normalization, and conversation switching logic.
   * Ensures tools compatibility and preserves existing conversation when appropriate.
   */
  const newQueryConvo = useCallback(
    (_newPreset?: TPreset) => {
      if (!_newPreset) {
        return;
      }
      const requestedPromptPrefix =
        typeof _newPreset.promptPrefix === 'string' ? _newPreset.promptPrefix : undefined;
      let newPreset = removeUnavailableTools(_newPreset, availableTools);
      delete newPreset.promptPrefix;

      if (requestedPromptPrefix != null && Object.keys(newPreset).length === 0) {
        newConversation({
          template: {
            chatProjectId: conversation?.chatProjectId ?? null,
            promptPrefix: requestedPromptPrefix,
          },
          keepAddedConvos: true,
        });
        return;
      }

      if (newPreset.spec != null && newPreset.spec !== '') {
        const modelSpecs = readStartupConfig()?.modelSpecs?.list ?? [];
        const spec = modelSpecs.find((s) => s.name === newPreset.spec);
        if (!spec) {
          return;
        }
        newPreset = {
          ...spec.preset,
          iconURL: getModelSpecIconURL(spec),
          spec: spec.name,
        } as TPreset;
      }

      let newEndpoint = newPreset.endpoint ?? '';
      const endpointsConfig = queryClient.getQueryData<TEndpointsConfig>([QueryKeys.endpoints]);

      if (newEndpoint && endpointsConfig && !endpointsConfig[newEndpoint]) {
        const normalizedNewEndpoint = newEndpoint.toLowerCase();
        for (const [key, value] of Object.entries(endpointsConfig)) {
          if (
            value &&
            value.type === EModelEndpoint.custom &&
            key.toLowerCase() === normalizedNewEndpoint
          ) {
            newEndpoint = key;
            newPreset.endpoint = key;
            newPreset.endpointType = EModelEndpoint.custom;
            break;
          }
        }
      }

      const {
        template,
        shouldSwitch,
        isNewModular,
        newEndpointType,
        isCurrentModular,
        isExistingConversation,
      } = getConvoSwitchLogic({
        newEndpoint,
        modularChat,
        conversation,
        endpointsConfig,
      });

      const resetFields = newPreset.spec == null ? specDisplayFieldReset : {};
      if (newPreset.spec == null) {
        Object.assign(template, specDisplayFieldReset);
        newPreset = { ...newPreset, ...specDisplayFieldReset };
      }

      // Sync agent_id from newPreset to template, then clear model if non-ephemeral agent
      if (newPreset.agent_id) {
        template.agent_id = newPreset.agent_id;
      }
      clearModelForNonEphemeralAgent(template);

      const isModular = isCurrentModular && isNewModular && shouldSwitch;
      if (isExistingConversation && isModular) {
        template.endpointType = newEndpointType as EModelEndpoint | undefined;

        const currentConvo = getDefaultConversation({
          /* target endpointType is necessary to avoid endpoint mixing */
          conversation: {
            ...(conversation ?? {}),
            endpointType: template.endpointType,
            ...resetFields,
          },
          preset: template,
          cleanOutput: newPreset.spec != null && newPreset.spec !== '',
        });
        if (requestedPromptPrefix != null) {
          currentConvo.promptPrefix = requestedPromptPrefix;
        }

        /* We don't reset the latest message, only when changing settings mid-converstion */
        logger.log('conversation', 'Switching conversation from query params', currentConvo);
        newConversation({
          template: currentConvo,
          preset: newPreset,
          keepAddedConvos: true,
        });
        return;
      }

      newConversation({
        template: {
          chatProjectId: conversation?.chatProjectId ?? null,
          ...(requestedPromptPrefix != null ? { promptPrefix: requestedPromptPrefix } : {}),
        },
        preset: newPreset,
        keepAddedConvos: true,
      });
    },
    [
      queryClient,
      modularChat,
      conversation,
      availableTools,
      newConversation,
      readStartupConfig,
      getDefaultConversation,
    ],
  );

  const conversationRef = useRef(conversation);
  conversationRef.current = conversation;

  const areSettingsApplied = useCallback(() => {
    const convo = conversationRef.current;
    if (!validSettingsRef.current || !convo) {
      return false;
    }

    for (const [key, value] of Object.entries(validSettingsRef.current)) {
      if (['presetOverride', 'iconURL', 'modelLabel'].includes(key)) {
        continue;
      }

      if (convo[key] !== value) {
        return false;
      }
    }

    return true;
  }, []);

  /**
   * Processes message submission exactly once, preventing duplicate submissions.
   * Sets the prompt text, submits the message, and cleans up URL parameters afterward.
   * Has internal guards to ensure it only executes once regardless of how many times it's called.
   */
  const processSubmission = useCallback(() => {
    if (submissionHandledRef.current || !pendingSubmitRef.current || !promptTextRef.current) {
      return;
    }

    submissionHandledRef.current = true;
    pendingSubmitRef.current = false;

    methods.setValue('text', promptTextRef.current, { shouldValidate: true });

    methods.handleSubmit((data) => {
      if (data.text?.trim()) {
        submitMessage(data);
        logger.log('conversation', 'Message submitted from query params');
      }
    })();

    /** Guest submission navigates to login. A second router navigation from the old chat page
     * can supersede that redirect, so the authenticated continuation owns URL cleanup. */
    if (isAuthenticated) {
      setSearchParams(getPreservedSearchParams(), { replace: true });
    }
  }, [methods, submitMessage, setSearchParams, getPreservedSearchParams, isAuthenticated]);

  useEffect(() => {
    const searchString = searchParams.toString();
    if (lastSearchRef.current !== searchString) {
      lastSearchRef.current = searchString;
      processedRef.current = false;
      attemptsRef.current = 0;
      waitAttemptsRef.current = 0;
      pendingSubmitRef.current = false;
      settingsAppliedRef.current = false;
      submissionHandledRef.current = false;
      promptTextRef.current = null;
      validSettingsRef.current = null;
      courseHandoffRef.current = null;
    }

    const processQueryParams = () => {
      if (isAuthenticated && guestHandoffRef.current === undefined) {
        guestHandoffRef.current = consumeGuestChatHandoff();
      }
      const guestHandoff = guestHandoffRef.current ?? null;
      const queryParams: Record<string, string> = {};
      searchParams.forEach((value, key) => {
        queryParams[key] = value;
      });

      const hasCourseHandoffParam = Object.prototype.hasOwnProperty.call(queryParams, 'coursewing');
      const courseHandoffId = queryParams.coursewing ?? null;
      delete queryParams.coursewing;
      if (courseHandoffId && courseHandoffRef.current?.id !== courseHandoffId) {
        courseHandoffRef.current = {
          id: courseHandoffId,
          value: consumeCourseChatHandoff(courseHandoffId),
        };
      }
      const courseHandoff =
        courseHandoffRef.current?.id === courseHandoffId ? courseHandoffRef.current.value : null;
      if (courseHandoff?.promptPrefix) {
        queryParams.promptPrefix = courseHandoff.promptPrefix;
      }
      if (courseHandoff?.spec != null && queryParams.spec == null) {
        queryParams.spec = courseHandoff.spec;
      }

      // Support both 'prompt' and 'q' as query parameters, with 'prompt' taking precedence
      const decodedPrompt =
        guestHandoff?.prompt || courseHandoff?.prompt || queryParams.prompt || queryParams.q || '';
      const shouldAutoSubmit =
        guestHandoff != null ||
        Boolean(courseHandoff?.prompt) ||
        queryParams.submit?.toLowerCase() === 'true';
      delete queryParams.prompt;
      delete queryParams.q;
      delete queryParams.submit;
      delete queryParams[PROJECT_ID_SEARCH_PARAM];
      const validSettings = {
        ...processValidSettings(queryParams),
        ...(guestHandoff ? processValidSettings(guestHandoff.settings) : {}),
      };

      return {
        decodedPrompt,
        validSettings,
        shouldAutoSubmit,
        guestHandoff: guestHandoff != null,
        explicitCourseSubmit: Boolean(courseHandoff?.prompt),
        invalidCourseHandoff: hasCourseHandoffParam && courseHandoff == null,
      };
    };

    const intervalId = setInterval(() => {
      waitAttemptsRef.current += 1;
      if (
        processedRef.current ||
        attemptsRef.current >= maxAttempts ||
        waitAttemptsRef.current >= maxWaitAttempts
      ) {
        clearInterval(intervalId);
        if (attemptsRef.current >= maxAttempts || waitAttemptsRef.current >= maxWaitAttempts) {
          console.warn('Max attempts reached, failed to process parameters');
        }
        return;
      }

      if (!textAreaRef.current) {
        return;
      }

      /** Do not destructively consume one-time handoffs until startup prerequisites exist. The
       * config query can legitimately take longer than the retry budget on a cold connection. */
      const startupConfig = readStartupConfig();
      if (!startupConfig) {
        return;
      }

      attemptsRef.current += 1;

      const {
        decodedPrompt,
        validSettings,
        shouldAutoSubmit,
        guestHandoff,
        explicitCourseSubmit,
        invalidCourseHandoff,
      } = processQueryParams();
      /** A guest handoff is the durable continuation of an explicit Send click. The original
       * course handoff may already have been consumed before login, so its stale URL handle must
       * not discard the valid guest draft and Canvas course context after authentication. */
      if (invalidCourseHandoff && !guestHandoff) {
        clearPendingCourse();
        processedRef.current = true;
        submissionHandledRef.current = true;
        clearInterval(intervalId);
        const remainingParams = new URLSearchParams(searchParams);
        remainingParams.delete('coursewing');
        setSearchParams(remainingParams, { replace: true });
        return;
      }
      const hasSettings = Object.keys(validSettings).length > 0;
      const hasProcessableParams = Boolean(decodedPrompt) || hasSettings || shouldAutoSubmit;
      if (!hasProcessableParams) {
        processedRef.current = true;
        submissionHandledRef.current = true;
        clearInterval(intervalId);
        return;
      }

      const autoSubmitAllowed = startupConfig.interface?.autoSubmitFromUrl !== false;
      /** Guest continuations and course prompt buttons follow explicit Send clicks; neither is
       * arbitrary URL-triggered automation. */
      const willAutoSubmit =
        guestHandoff || explicitCourseSubmit || (shouldAutoSubmit && autoSubmitAllowed);

      if (!willAutoSubmit) {
        submissionHandledRef.current = true;
      }

      /** Mark processing as complete and clean up as needed */
      const success = () => {
        processedRef.current = true;
        if (guestHandoff) {
          guestHandoffRef.current = null;
        }
        logger.log('conversation', 'Query parameters processed successfully');
        clearInterval(intervalId);

        // Defer URL cleanup until after submission completes (processSubmission handles it);
        // skip it entirely when nothing was consumed so the URL rewrite cannot retrigger this effect
        if (isAuthenticated && !pendingSubmitRef.current && hasProcessableParams) {
          setSearchParams(getPreservedSearchParams(), { replace: true });
        }
      };

      if (hasSettings) {
        validSettingsRef.current = validSettings;
      }

      if (decodedPrompt) {
        promptTextRef.current = decodedPrompt;
      }

      const settingsAlreadyApplied = hasSettings && areSettingsApplied();

      // Handle auto-submission
      if (willAutoSubmit && decodedPrompt) {
        if (hasSettings) {
          // Settings are changing, defer submission
          pendingSubmitRef.current = true;

          if (!settingsAlreadyApplied) {
            // Set a timeout to handle the case where settings might never fully apply
            settingsTimeoutRef.current = setTimeout(() => {
              if (!submissionHandledRef.current && pendingSubmitRef.current) {
                logger.log(
                  'conversation',
                  'Settings application timeout, proceeding with submission',
                );
                processSubmission();
              }
            }, MAX_SETTINGS_WAIT_MS);
          }
        } else {
          methods.setValue('text', decodedPrompt, { shouldValidate: true });
          textAreaRef.current.focus();
          textAreaRef.current.setSelectionRange(decodedPrompt.length, decodedPrompt.length);

          methods.handleSubmit((data) => {
            if (data.text?.trim()) {
              submitMessage(data);
            }
          })();
        }
      } else if (decodedPrompt) {
        methods.setValue('text', decodedPrompt, { shouldValidate: true });
        textAreaRef.current.focus();
        textAreaRef.current.setSelectionRange(decodedPrompt.length, decodedPrompt.length);
      } else {
        submissionHandledRef.current = true;
      }

      if (hasSettings && !settingsAlreadyApplied) {
        newQueryConvo(validSettings);
      }

      success();
      if (settingsAlreadyApplied && pendingSubmitRef.current) {
        settingsAppliedRef.current = true;
        logger.log('conversation', 'URL settings already applied, processing submission');
        processSubmission();
      }
    }, 100);

    return () => {
      clearInterval(intervalId);
      if (settingsTimeoutRef.current) {
        clearTimeout(settingsTimeoutRef.current);
      }
    };
  }, [
    searchParams,
    methods,
    textAreaRef,
    newQueryConvo,
    newConversation,
    submitMessage,
    setSearchParams,
    getPreservedSearchParams,
    queryClient,
    processSubmission,
    areSettingsApplied,
    readStartupConfig,
    isAuthenticated,
  ]);

  useEffect(() => {
    // Only proceed if we've already processed URL parameters but haven't yet handled submission
    if (
      !processedRef.current ||
      submissionHandledRef.current ||
      settingsAppliedRef.current ||
      !validSettingsRef.current ||
      !conversation
    ) {
      return;
    }

    if (areSettingsApplied()) {
      settingsAppliedRef.current = true;

      if (pendingSubmitRef.current) {
        if (settingsTimeoutRef.current) {
          clearTimeout(settingsTimeoutRef.current);
          settingsTimeoutRef.current = null;
        }

        logger.log('conversation', 'Settings fully applied, processing submission');
        processSubmission();
      }
    }
  }, [conversation, processSubmission, areSettingsApplied]);

  const agentsMap = useAgentsMap({ isAuthenticated });
  useEffect(() => {
    if (urlAgent) {
      injectAgentIntoAgentsMap(queryClient, urlAgent);
    }
  }, [urlAgent, queryClient, agentsMap]);
}
