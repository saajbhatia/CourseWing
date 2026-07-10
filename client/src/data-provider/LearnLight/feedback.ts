import { useMutation } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';
import { useCanvasConnectionQuery } from './canvas';
import { learnLightBaseUrl } from './queries';

export type SendFeedbackPayload = {
  message: string;
  shareChat: boolean;
  conversationId?: string | null;
  userName?: string | null;
  userEmail?: string | null;
};

async function postFeedback(payload: SendFeedbackPayload, tenantId?: string): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (tenantId) {
    headers['X-Tenant-Id'] = tenantId;
  }

  const response = await fetch(`${learnLightBaseUrl}/api/learnlight/feedback`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Sending feedback failed: ${response.status}`);
  }
}

export function useSendFeedbackMutation(): UseMutationResult<void, Error, SendFeedbackPayload> {
  const connection = useCanvasConnectionQuery();
  const tenantId =
    connection.data?.connected === true ? connection.data.tenantId : undefined;

  return useMutation<void, Error, SendFeedbackPayload>((payload) =>
    postFeedback(payload, tenantId),
  );
}
