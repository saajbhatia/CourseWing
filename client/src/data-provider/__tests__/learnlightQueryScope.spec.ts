import { QueryClient } from '@tanstack/react-query';
import { conversationQueryKey, conversationsQueryKey } from '../queries';

describe('LearnLight account-scoped conversation caches', () => {
  it('does not reuse a colliding Canvas course id after an account switch', () => {
    const queryClient = new QueryClient();
    const oldAccountKey = 'aaaaaaaaaaaaaaaaaaaaaaaa';
    const newAccountKey = 'bbbbbbbbbbbbbbbbbbbbbbbb';
    const oldKey = conversationsQueryKey({ canvasCourseId: 42 }, oldAccountKey);
    const newKey = conversationsQueryKey({ canvasCourseId: 42 }, newAccountKey);

    queryClient.setQueryData(oldKey, {
      pages: [{ conversations: [{ conversationId: 'old-chat' }], nextCursor: null }],
      pageParams: [undefined],
    });

    expect(newKey).not.toEqual(oldKey);
    expect(queryClient.getQueryData(newKey)).toBeUndefined();
  });

  it('scopes derived conversation detail state to the current Canvas account', () => {
    const oldKey = conversationQueryKey('same-chat', 'aaaaaaaaaaaaaaaaaaaaaaaa');
    const newKey = conversationQueryKey('same-chat', 'bbbbbbbbbbbbbbbbbbbbbbbb');
    expect(newKey).not.toEqual(oldKey);
  });
});
