import { useMemo, useCallback } from 'react';
import { EModelEndpoint, Constants } from 'librechat-data-provider';
import {
  useGetAssistantDocsQuery,
  useGetEndpointsQuery,
  useGetStartupConfig,
} from '~/data-provider';
import { useChatContext, useAgentsMapContext, useAssistantsMapContext } from '~/Providers';
import { getIconEndpoint, getEntity, getModelSpec } from '~/utils';
import { useCurrentCoursesQuery } from '~/data-provider/CourseWing';
import { useSubmitMessage, useLocalize } from '~/hooks';

/** Canvas course names carry section codes and year suffixes ("AP Calculus AB (LF) 25-26") that make chips wrap badly. */
function shortCourseName(name: string): string {
  const cleaned = name
    .replace(/\s*\([^)]{1,8}\)/g, '')
    .replace(/\s*\b(?:20)?\d{2}\s*[-–/]\s*(?:20)?\d{2}\b\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return cleaned.length >= 3 ? cleaned : name;
}

const ConversationStarters = () => {
  const localize = useLocalize();
  const { conversation } = useChatContext();
  const agentsMap = useAgentsMapContext();
  const assistantMap = useAssistantsMapContext();
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const { data: startupConfig } = useGetStartupConfig();
  const { data: courses } = useCurrentCoursesQuery();

  const endpointType = useMemo(() => {
    let ep = conversation?.endpoint ?? '';
    if (ep === EModelEndpoint.azureOpenAI) {
      ep = EModelEndpoint.openAI;
    }
    return getIconEndpoint({
      endpointsConfig,
      iconURL: conversation?.iconURL,
      endpoint: ep,
    });
  }, [conversation?.endpoint, conversation?.iconURL, endpointsConfig]);

  const { data: documentsMap = new Map() } = useGetAssistantDocsQuery(endpointType, {
    select: (data) => new Map(data.map((dbA) => [dbA.assistant_id, dbA])),
  });

  const { entity, isAgent } = getEntity({
    endpoint: endpointType,
    agentsMap,
    assistantMap,
    agent_id: conversation?.agent_id,
    assistant_id: conversation?.assistant_id,
  });

  const modelSpec = useMemo(
    () => getModelSpec({ specName: conversation?.spec, startupConfig }),
    [conversation?.spec, startupConfig],
  );

  /** Starters grounded in the student's real synced classes beat static prompts. */
  const courseWingStarters = useMemo(() => {
    if (startupConfig?.courseWingEnabled !== true || courses == null || courses.length === 0) {
      return [];
    }
    return [
      localize('com_ui_starter_due_week'),
      ...courses
        .slice(0, 2)
        .map((course) => localize('com_ui_starter_study_course', { 0: shortCourseName(course.name) })),
      localize('com_ui_starter_grades'),
    ];
  }, [startupConfig?.courseWingEnabled, courses, localize]);

  const conversation_starters = useMemo(() => {
    if (entity?.conversation_starters?.length) {
      return entity.conversation_starters;
    }

    if (courseWingStarters.length) {
      return courseWingStarters;
    }

    if (modelSpec?.conversation_starters?.length) {
      return modelSpec.conversation_starters;
    }

    if (isAgent) {
      return [];
    }

    return documentsMap.get(entity?.id ?? '')?.conversation_starters ?? [];
  }, [documentsMap, isAgent, entity, modelSpec, courseWingStarters]);

  const { submitMessage } = useSubmitMessage();
  const sendConversationStarter = useCallback(
    (text: string) => submitMessage({ text }),
    [submitMessage],
  );

  if (!conversation_starters.length) {
    return null;
  }

  return (
    <div className="mb-8 mt-2 flex w-full flex-wrap items-stretch justify-center gap-2 px-4">
      {conversation_starters
        .slice(0, Constants.MAX_CONVO_STARTERS)
        .map((text: string, index: number) => (
          <button
            key={index}
            onClick={() => sendConversationStarter(text)}
            style={{ animationDelay: `${index * 75}ms`, animationFillMode: 'backwards' }}
            className="flex max-w-[16rem] cursor-pointer items-center justify-center rounded-2xl border border-border-medium bg-surface-secondary px-4 py-2.5 text-center text-sm text-text-secondary shadow-sm transition-colors duration-200 fade-in hover:border-border-heavy hover:bg-surface-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
          >
            <span className="line-clamp-2 text-balance break-words">{text}</span>
          </button>
        ))}
    </div>
  );
};

export default ConversationStarters;
