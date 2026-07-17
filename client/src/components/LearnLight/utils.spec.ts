import { Constants } from 'librechat-data-provider';
import { consumeGuestChatHandoff, storeGuestChatHandoff } from '~/utils/guestChatHandoff';
import { clearPendingCourse, consumeCourseChatHandoff, openCourseChat } from './utils';

describe('openCourseChat', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('applies the course prefix as a conversation template so the model spec is preserved', () => {
    const navigate = jest.fn();
    const newConversation = jest.fn();

    openCourseChat(
      navigate,
      newConversation,
      { canvasCourseId: 42, name: 'Chemistry', courseCode: 'CHEM' },
      { promptPrefix: 'Canvas course ID: 42', greeting: 'What are we studying?' },
    );

    expect(newConversation).toHaveBeenCalledWith({
      disableFocus: true,
      template: { promptPrefix: 'Canvas course ID: 42' },
    });
    const destination = navigate.mock.calls[0][0] as string;
    const url = new URL(destination, 'https://example.test');
    const handoffId = url.searchParams.get('learnlight');
    expect(url.pathname).toBe(`/c/${Constants.NEW_CONVO}`);
    expect([...url.searchParams.keys()]).toEqual(['learnlight']);
    expect(destination).not.toContain('Canvas');
    expect(consumeCourseChatHandoff(handoffId)).toEqual({
      promptPrefix: 'Canvas course ID: 42',
    });
    expect(consumeCourseChatHandoff(handoffId)).toBeNull();
    expect(sessionStorage.getItem('learnlight:pendingCourse')).toBe('42');
    expect(sessionStorage.getItem('learnlight:pendingGreeting')).toBe('What are we studying?');
  });

  it('keeps the prompt and course context out of the URL in a one-time handoff', () => {
    const navigate = jest.fn();

    openCourseChat(
      navigate,
      jest.fn(),
      { canvasCourseId: 42, name: 'Chemistry', courseCode: 'CHEM' },
      { promptPrefix: 'Canvas course ID: 42', prompt: 'Make a study plan' },
    );

    const destination = navigate.mock.calls[0][0] as string;
    const url = new URL(destination, 'https://example.test');
    expect(destination).not.toContain('Make');
    expect(destination).not.toContain('Canvas');
    expect(consumeCourseChatHandoff(url.searchParams.get('learnlight'))).toEqual({
      promptPrefix: 'Canvas course ID: 42',
      prompt: 'Make a study plan',
    });
    expect(sessionStorage.getItem('learnlight:pendingGreeting')).toBeNull();
  });

  it('preserves assignment context when a guest submits before conversation state catches up', () => {
    const navigate = jest.fn();
    const assignmentPrefix = [
      'Canvas course ID: 42',
      'Current Canvas course: Chemistry',
      'Canvas assignment ID: 314',
      'Assignment: Semester Exam',
    ].join('\n');

    openCourseChat(
      navigate,
      jest.fn(),
      { canvasCourseId: 42, name: 'Chemistry', courseCode: 'CHEM' },
      { promptPrefix: assignmentPrefix, greeting: 'Ready to study?' },
    );

    expect(
      storeGuestChatHandoff('When is this assignment due?', {
        conversationId: 'new',
        title: 'New chat',
        createdAt: '',
        updatedAt: '',
        endpoint: null,
        model: null,
        promptPrefix: 'Canvas course ID: 42\nCurrent Canvas course: stale course-only context',
      }),
    ).toBe(true);
    expect(consumeGuestChatHandoff()).toEqual({
      prompt: 'When is this assignment due?',
      settings: { promptPrefix: assignmentPrefix },
    });
  });

  it('clears pending chat handoffs when Canvas identity state is reset', () => {
    const navigate = jest.fn();
    openCourseChat(
      navigate,
      jest.fn(),
      { canvasCourseId: 42, name: 'Chemistry', courseCode: 'CHEM' },
      { promptPrefix: 'Canvas course ID: 42', prompt: 'Private study request' },
    );
    const destination = navigate.mock.calls[0][0] as string;
    const handoffId = new URL(destination, 'https://example.test').searchParams.get('learnlight');

    clearPendingCourse();

    expect(consumeCourseChatHandoff(handoffId)).toBeNull();
    expect(sessionStorage.getItem('learnlight:pendingCourse')).toBeNull();
    expect(storeGuestChatHandoff('This must not inherit stale course context', null)).toBe(true);
    expect(consumeGuestChatHandoff()).toEqual({
      prompt: 'This must not inherit stale course context',
      settings: {},
    });
  });

  it('fails closed without navigating when private handoff storage is unavailable', () => {
    const navigate = jest.fn();
    const newConversation = jest.fn();
    const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new DOMException('Storage blocked', 'SecurityError');
    });

    expect(
      openCourseChat(
        navigate,
        newConversation,
        { canvasCourseId: 42, name: 'Chemistry', courseCode: 'CHEM' },
        { promptPrefix: 'Canvas course ID: 42', greeting: 'Ready to study?' },
      ),
    ).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
    expect(newConversation).not.toHaveBeenCalled();
    setItem.mockRestore();
  });
});
