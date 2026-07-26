import { logger } from '@librechat/data-schemas';
import {
  Tools,
  Constants,
  extractCanvasCourseId,
  isAgentsEndpoint,
  isEphemeralAgentId,
  encodeEphemeralAgentId,
} from 'librechat-data-provider';
import type {
  AgentModelParameters,
  TEphemeralAgent,
  TModelSpec,
  Agent,
} from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';
import { nativeCourseToolKeys } from '~/courses';
import { isCourseWingEnabled, courseWingToolKeys } from '~/coursewing';
import { requiresEphemeralUserConnection } from '~/mcp/utils';
import { getCustomEndpointConfig } from '~/app/config';

const { mcp_all, mcp_delimiter } = Constants;
type ModelParametersWithPromptPrefix = AgentModelParameters & { promptPrefix?: string | null };

const nativeCourseAssistantGuidance = [
  'When using native_course tools, treat course, project, member, work, AI-use, file, feedback, action-item, receipt, and undo identifiers as private implementation details.',
  'Use exact identifiers internally for tool calls, but do not print them in the user-facing answer unless the user explicitly asks for an identifier.',
  'Confirm completed actions with human-readable course, project, file, or record names, and keep any undo receipt available internally for a later undo request.',
].join(' ');

function applyCourseWingCourseOverlay(agent: Agent, promptPrefix: string): Agent {
  const instructions = [agent.instructions, promptPrefix]
    .filter((section): section is string => typeof section === 'string' && section.trim() !== '')
    .join('\n\n');
  const tools = new Set(agent.tools ?? []);
  for (const toolKey of courseWingToolKeys) {
    tools.add(toolKey);
  }

  return {
    ...agent,
    instructions,
    tools: Array.from(tools),
  };
}

function applyNativeCourseOverlay(agent: Agent): Agent {
  const tools = new Set(agent.tools ?? []);
  for (const toolKey of nativeCourseToolKeys) {
    tools.add(toolKey);
  }
  const instructions = [agent.instructions, nativeCourseAssistantGuidance]
    .filter((section): section is string => typeof section === 'string' && section.trim() !== '')
    .join('\n\n');
  return {
    ...agent,
    instructions,
    tools: Array.from(tools),
  };
}

export interface LoadAgentDeps {
  getAgent: (searchParameter: { id: string }) => Promise<Agent | null>;
  getMCPServerTools: (
    userId: string,
    serverName: string,
  ) => Promise<Record<string, unknown> | null>;
  hasNativeCourseAccess?: (userId: string, email?: string) => Promise<boolean>;
}

export interface LoadAgentParams {
  req: {
    user?: { id?: string; email?: string };
    config?: AppConfig;
    body?: {
      promptPrefix?: string;
      ephemeralAgent?: TEphemeralAgent;
    };
  };
  spec?: string;
  agent_id: string;
  endpoint: string;
  model_parameters?: AgentModelParameters & { model?: string };
  /** Applies request-scoped CourseWing context to the primary chat agent only. */
  applyCourseWingCourseContext?: boolean;
}

async function canUseNativeCourseTools(
  req: LoadAgentParams['req'],
  deps: LoadAgentDeps,
): Promise<boolean> {
  const userId = req.user?.id;
  if (!userId || !deps.hasNativeCourseAccess) {
    return false;
  }
  try {
    return await deps.hasNativeCourseAccess(userId, req.user?.email);
  } catch (error) {
    logger.error('[loadAgent] Error checking native course access', error);
    return false;
  }
}

/**
 * Load an ephemeral agent based on the request parameters.
 */
export async function loadEphemeralAgent(
  { req, spec, endpoint, model_parameters: _m }: Omit<LoadAgentParams, 'agent_id'>,
  deps: LoadAgentDeps,
): Promise<Agent | null> {
  const { model, ...model_parameters } = _m ?? ({} as unknown as AgentModelParameters);
  const modelSpecs = req.config?.modelSpecs as { list?: TModelSpec[] } | undefined;
  let modelSpec: TModelSpec | null = null;
  if (spec != null && spec !== '') {
    modelSpec = modelSpecs?.list?.find((s) => s.name === spec) ?? null;
  }
  const ephemeralAgent: TEphemeralAgent | undefined = req.body?.ephemeralAgent;
  const mcpServers = new Set<string>(ephemeralAgent?.mcp);
  const userId = req.user?.id ?? '';
  if (modelSpec?.mcpServers) {
    for (const mcpServer of modelSpec.mcpServers) {
      mcpServers.add(mcpServer);
    }
  }
  const tools: string[] = [];
  if (ephemeralAgent?.execute_code === true || modelSpec?.executeCode === true) {
    tools.push(Tools.execute_code);
  }
  if (ephemeralAgent?.file_search === true || modelSpec?.fileSearch === true) {
    tools.push(Tools.file_search);
  }
  if (ephemeralAgent?.web_search === true || modelSpec?.webSearch === true) {
    tools.push(Tools.web_search);
  }
  if (ephemeralAgent?.memory === true || modelSpec?.memory === true) {
    tools.push(Tools.memory);
  }
  if (isCourseWingEnabled()) {
    tools.push(...courseWingToolKeys);
  }
  const hasNativeCourseAccess = await canUseNativeCourseTools(req, deps);
  if (hasNativeCourseAccess) {
    tools.push(...nativeCourseToolKeys);
  }

  const addedServers = new Set<string>();
  if (mcpServers.size > 0) {
    for (const mcpServer of mcpServers) {
      if (addedServers.has(mcpServer)) {
        continue;
      }
      /** Request-tier overlays are invisible to the cache service's registry
       *  resolver — overlay-scoped servers expand fresh via `mcp_all` instead */
      const overlayConfig = req.config?.mcpConfig?.[mcpServer];
      const serverTools =
        overlayConfig && requiresEphemeralUserConnection(overlayConfig)
          ? null
          : await deps.getMCPServerTools(userId, mcpServer);
      if (!serverTools) {
        tools.push(`${mcp_all}${mcp_delimiter}${mcpServer}`);
        addedServers.add(mcpServer);
        continue;
      }
      tools.push(...Object.keys(serverTools));
      addedServers.add(mcpServer);
    }
  }

  const requestPromptPrefix = req.body?.promptPrefix;
  const { promptPrefix: modelPromptPrefix, ...safeModelParameters } =
    model_parameters as ModelParametersWithPromptPrefix;
  const baseInstructions =
    typeof modelPromptPrefix === 'string' ? modelPromptPrefix : requestPromptPrefix;
  const instructions = hasNativeCourseAccess
    ? [baseInstructions, nativeCourseAssistantGuidance]
        .filter(
          (section): section is string => typeof section === 'string' && section.trim() !== '',
        )
        .join('\n\n')
    : baseInstructions;

  // Get endpoint config for modelDisplayLabel fallback
  const appConfig = req.config;
  const endpoints = appConfig?.endpoints;
  let endpointConfig = endpoints?.[endpoint as keyof typeof endpoints];
  if (!isAgentsEndpoint(endpoint) && !endpointConfig) {
    try {
      endpointConfig = getCustomEndpointConfig({ endpoint, appConfig });
    } catch (err) {
      logger.error('[loadEphemeralAgent] Error getting custom endpoint config', err);
    }
  }

  // For ephemeral agents, use modelLabel if provided, then model spec's label,
  // then modelDisplayLabel from endpoint config, otherwise empty string to show model name
  const sender =
    (model_parameters as AgentModelParameters & { modelLabel?: string })?.modelLabel ??
    modelSpec?.label ??
    (endpointConfig as { modelDisplayLabel?: string } | undefined)?.modelDisplayLabel ??
    '';

  // Encode ephemeral agent ID with endpoint, model, and computed sender for display
  const ephemeralId = encodeEphemeralAgentId({
    endpoint,
    model: model as string,
    sender: sender as string,
  });

  const result: Partial<Agent> = {
    id: ephemeralId,
    instructions,
    provider: endpoint,
    model_parameters: safeModelParameters as AgentModelParameters,
    model,
    tools,
  };

  if (ephemeralAgent?.artifacts) {
    result.artifacts = ephemeralAgent.artifacts;
  }
  if (modelSpec?.subagents) {
    result.subagents = modelSpec.subagents;
  }
  if (modelSpec && Object.prototype.hasOwnProperty.call(modelSpec, 'skills')) {
    if (modelSpec.skills === true) {
      result.skills_enabled = true;
    } else if (modelSpec.skills === false) {
      result.skills_enabled = false;
      result.skills = [];
    } else if (Array.isArray(modelSpec.skills)) {
      result.skills_enabled = true;
      result.skills = [];
    }
  }
  return result as Agent;
}

/**
 * Load an agent based on the provided ID.
 * For ephemeral agents, builds a synthetic agent from request parameters.
 * For persistent agents, fetches from the database.
 */
export async function loadAgent(
  params: LoadAgentParams,
  deps: LoadAgentDeps,
): Promise<Agent | null> {
  const { req, spec, agent_id, endpoint, model_parameters, applyCourseWingCourseContext } = params;
  if (!agent_id) {
    return null;
  }
  if (isEphemeralAgentId(agent_id)) {
    return loadEphemeralAgent({ req, spec, endpoint, model_parameters }, deps);
  }
  const agent = await deps.getAgent({ id: agent_id });

  if (!agent) {
    return null;
  }

  // Set version count from versions array length
  const agentWithVersion = {
    ...agent,
    version: (agent as Agent & { versions?: unknown[]; version?: number }).versions?.length ?? 0,
  } as Agent & { versions?: unknown[]; version?: number };

  const promptPrefix = req.body?.promptPrefix;
  let runtimeAgent: Agent = agentWithVersion;
  if (!isCourseWingEnabled() && Array.isArray(agentWithVersion.tools)) {
    const filteredTools = agentWithVersion.tools.filter(
      (toolKey) => !courseWingToolKeys.includes(toolKey as (typeof courseWingToolKeys)[number]),
    );
    if (filteredTools.length !== agentWithVersion.tools.length) {
      runtimeAgent = { ...runtimeAgent, tools: filteredTools };
    }
  }
  const isCourseWingCourseRequest =
    applyCourseWingCourseContext === true &&
    isCourseWingEnabled() &&
    typeof promptPrefix === 'string' &&
    extractCanvasCourseId(promptPrefix) != null;
  if (isCourseWingCourseRequest) {
    runtimeAgent = applyCourseWingCourseOverlay(runtimeAgent, promptPrefix);
  }

  if (await canUseNativeCourseTools(req, deps)) {
    runtimeAgent = applyNativeCourseOverlay(runtimeAgent);
  }

  return runtimeAgent;
}
