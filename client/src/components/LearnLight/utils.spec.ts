import { Constants } from 'librechat-data-provider';
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
