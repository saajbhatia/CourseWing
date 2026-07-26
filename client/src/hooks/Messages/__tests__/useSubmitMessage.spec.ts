import { act, renderHook } from '@testing-library/react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { useChatContext, useChatFormContext, useAddedChatContext } from '~/Providers';
import { useLatestMessage } from '~/hooks/Messages/useLatestMessage';
import { useAuthContext } from '~/hooks/AuthContext';
import { buildLoginRedirectUrl } from 'librechat-data-provider';
import useSubmitMessage from '../useSubmitMessage';

const mockSetActivePrompt = jest.fn();
const mockNavigate = jest.fn();
const mockStoreGuestChatHandoff = jest.fn();
const mockShowToast = jest.fn();
const mockUseLocation = jest.fn(() => ({ pathname: '/c/new', search: '', hash: '' }));

jest.mock('recoil', () => ({
  useRecoilValue: jest.fn(),
  useSetRecoilState: jest.fn(),
}));

jest.mock('@librechat/client', () => ({
  useToastContext: () => ({ showToast: mockShowToast }),
}));

jest.mock('~/hooks/useLocalize', () => ({
  __esModule: true,
  default: () => (key: string) => key,
}));

jest.mock('librechat-data-provider', () => ({
  replaceSpecialVars: jest.fn(({ text }) => text),
  buildLoginRedirectUrl: jest.fn(() => '/login?redirect_to=%2Fc%2Fnew'),
}));

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => mockUseLocation(),
}));

jest.mock('~/utils/guestChatHandoff', () => ({
  storeGuestChatHandoff: (...args: unknown[]) => mockStoreGuestChatHandoff(...args),
}));

jest.mock('~/Providers', () => ({
  useChatContext: jest.fn(),
  useChatFormContext: jest.fn(),
  useAddedChatContext: jest.fn(),
}));

jest.mock('~/hooks/AuthContext', () => ({
  useAuthContext: jest.fn(),
}));

jest.mock('~/hooks/Messages/useLatestMessage', () => ({
  useLatestMessage: jest.fn(),
}));

jest.mock('~/store', () => ({
  __esModule: true,
  default: {
    autoSendPrompts: 'autoSendPrompts',
    activePromptByIndex: jest.fn(() => 'activePromptByIndex'),
  },
}));

const mockUseRecoilValue = useRecoilValue as jest.Mock;
const mockUseSetRecoilState = useSetRecoilState as jest.Mock;
const mockUseChatContext = useChatContext as jest.Mock;
const mockUseChatFormContext = useChatFormContext as jest.Mock;
const mockUseAddedChatContext = useAddedChatContext as jest.Mock;
const mockUseAuthContext = useAuthContext as jest.Mock;
const mockUseLatestMessage = useLatestMessage as jest.Mock;
const mockBuildLoginRedirectUrl = buildLoginRedirectUrl as jest.Mock;

describe('useSubmitMessage', () => {
  const ask = jest.fn();
  const reset = jest.fn();
  const setMessages = jest.fn();
  const getMessages = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockStoreGuestChatHandoff.mockReturnValue(true);
    mockUseLocation.mockReturnValue({ pathname: '/c/new', search: '', hash: '' });
    mockUseRecoilValue.mockReturnValue(false);
    mockUseSetRecoilState.mockReturnValue(mockSetActivePrompt);
    mockUseAuthContext.mockReturnValue({ user: { id: 'user-1' }, isAuthenticated: true });
    mockUseAddedChatContext.mockReturnValue({ conversation: null });
    mockUseChatFormContext.mockReturnValue({ reset, getValues: jest.fn(() => '') });
    mockUseLatestMessage.mockReturnValue({ messageId: 'assistant-message' });
    getMessages.mockReturnValue([{ messageId: 'assistant-message' }]);
    mockUseChatContext.mockReturnValue({
      ask,
      index: 0,
      conversation: { endpoint: 'bedrock', model: 'claude' },
      getMessages,
      setMessages,
    });
  });

  it('propagates blocked submits so direct callers can preserve their text', () => {
    ask.mockReturnValue(false);

    const { result } = renderHook(() => useSubmitMessage());

    let submitted: false | void = undefined;
    act(() => {
      submitted = result.current.submitMessage({ text: 'dictated follow-up' });
    });

    expect(submitted).toBe(false);
    expect(reset).not.toHaveBeenCalled();
  });

  it('stores a private one-time handoff before redirecting a guest to login', () => {
    const conversation = { endpoint: 'bedrock', model: 'claude' };
    mockUseAuthContext.mockReturnValue({ user: undefined, isAuthenticated: false });
    mockUseChatContext.mockReturnValue({
      ask,
      index: 0,
      conversation,
      getMessages,
      setMessages,
    });

    const { result } = renderHook(() => useSubmitMessage());
    act(() => {
      result.current.submitMessage({ text: 'private draft' });
    });

    expect(mockStoreGuestChatHandoff).toHaveBeenCalledWith('private draft', conversation);
    expect(mockNavigate).toHaveBeenCalledWith('/login?redirect_to=%2Fc%2Fnew');
    expect(ask).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
  });

  it('removes a consumed course handoff from the login redirect and preserves other params', () => {
    mockUseLocation.mockReturnValue({
      pathname: '/c/new',
      search: '?coursewing=consumed-123&campaign=summer',
      hash: '#composer',
    });
    mockUseAuthContext.mockReturnValue({ user: undefined, isAuthenticated: false });

    const { result } = renderHook(() => useSubmitMessage());
    act(() => {
      result.current.submitMessage({ text: 'Explain this assignment' });
    });

    expect(mockBuildLoginRedirectUrl).toHaveBeenCalledWith(
      '/c/new',
      '?campaign=summer',
      '#composer',
    );
  });

  it('keeps a guest draft in the composer when the private handoff cannot be stored', () => {
    mockStoreGuestChatHandoff.mockReturnValue(false);
    mockUseAuthContext.mockReturnValue({ user: undefined, isAuthenticated: false });

    const { result } = renderHook(() => useSubmitMessage());
    act(() => {
      result.current.submitMessage({ text: 'Do not lose this draft' });
    });

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(ask).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledWith({
      status: 'error',
      message: 'com_ui_guest_handoff_error',
    });
  });
});
