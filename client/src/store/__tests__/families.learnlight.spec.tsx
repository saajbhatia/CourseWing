import { act, render } from '@testing-library/react';
import { RecoilRoot, useSetRecoilState } from 'recoil';
import { Constants, EModelEndpoint } from 'librechat-data-provider';
import type { TConversation } from 'librechat-data-provider';
import families from '../families';

const baseConversation: TConversation = {
  conversationId: Constants.NEW_CONVO as string,
  title: 'New Chat',
  endpoint: null,
  createdAt: '',
  updatedAt: '',
};

function ConversationWriter({
  onReady,
}: {
  onReady: (write: (value: TConversation) => void) => void;
}) {
  const setConversation = useSetRecoilState(families.conversationByIndex(0));
  onReady(setConversation);
  return null;
}

describe('conversation URL synchronization', () => {
  it('keeps a pending LearnLight handoff while the default model spec is applied', async () => {
    let writeConversation: ((value: TConversation) => void) | undefined;
    render(
      <RecoilRoot>
        <ConversationWriter onReady={(write) => (writeConversation = write)} />
      </RecoilRoot>,
    );

    await act(async () => {
      writeConversation?.(baseConversation);
    });
    window.history.replaceState({}, '', '/c/new?learnlight=review-session-123');

    await act(async () => {
      writeConversation?.({
        ...baseConversation,
        endpoint: EModelEndpoint.bedrock,
        model: 'claude',
        spec: 'course-tutor',
      });
    });

    expect(window.location.pathname).toBe('/c/new');
    expect(window.location.search).toBe('?spec=course-tutor&learnlight=review-session-123');
  });
});
