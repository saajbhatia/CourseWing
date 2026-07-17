import { useMutation } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';
import { request } from 'librechat-data-provider';
import { learnLightBaseUrl } from './queries';

export type SendFeedbackPayload = {
  message: string;
  shareChat: boolean;
  conversationId?: string | null;
  targetMessageId?: string | null;
};

export type SendFeedbackResult = {
  warning?: 'chat_share_failed';
};

async function postFeedback(payload: SendFeedbackPayload): Promise<SendFeedbackResult> {
  return request.post(`${learnLightBaseUrl}/feedback`, payload);
}

export function useSendFeedbackMutation(): UseMutationResult<
  SendFeedbackResult,
  Error,
  SendFeedbackPayload
> {
  return useMutation<SendFeedbackResult, Error, SendFeedbackPayload>(postFeedback);
}
