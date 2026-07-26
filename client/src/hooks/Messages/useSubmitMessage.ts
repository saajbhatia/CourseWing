import { useCallback } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { useLocation, useNavigate } from 'react-router-dom';
import { useToastContext } from '@librechat/client';
import { replaceSpecialVars, buildLoginRedirectUrl } from 'librechat-data-provider';
import { useChatContext, useChatFormContext, useAddedChatContext } from '~/Providers';
import { useLatestMessage } from '~/hooks/Messages/useLatestMessage';
import { useAuthContext } from '~/hooks/AuthContext';
import useLocalize from '~/hooks/useLocalize';
import { storeGuestChatHandoff } from '~/utils/guestChatHandoff';
import { mainTextareaId } from '~/common';
import store from '~/store';

export default function useSubmitMessage() {
  const { user, isAuthenticated } = useAuthContext();
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const navigate = useNavigate();
  const location = useLocation();
  const methods = useChatFormContext();
  const { conversation: addedConvo } = useAddedChatContext();
  const { ask, index, conversation, getMessages, setMessages } = useChatContext();
  const latestMessage = useLatestMessage(index);

  const autoSendPrompts = useRecoilValue(store.autoSendPrompts);
  const setActivePrompt = useSetRecoilState(store.activePromptByIndex(index));

  const submitMessage = useCallback(
    (data?: { text: string }) => {
      if (!data) {
        return console.warn('No data provided to submitMessage');
      }
      if (!isAuthenticated) {
        if (!storeGuestChatHandoff(data.text, conversation)) {
          showToast({
            status: 'error',
            message: localize('com_ui_guest_handoff_error'),
          });
          return false;
        }
        const loginSearchParams = new URLSearchParams(location.search);
        /** The one-time course handoff has already been consumed by useQueryParams. The private
         * guest handoff now owns the prompt and course context, so do not replay a stale handle
         * after authentication. Preserve unrelated query parameters. */
        loginSearchParams.delete('coursewing');
        const loginSearch = loginSearchParams.toString();
        navigate(
          buildLoginRedirectUrl(
            location.pathname,
            loginSearch ? `?${loginSearch}` : '',
            location.hash,
          ),
        );
        return false;
      }
      const rootMessages = getMessages();
      const isLatestInRootMessages = rootMessages?.some(
        (message) => message.messageId === latestMessage?.messageId,
      );
      if (!isLatestInRootMessages && latestMessage) {
        setMessages([...(rootMessages || []), latestMessage]);
      }

      const submitted = ask(
        {
          text: data.text,
        },
        {
          addedConvo: addedConvo ?? undefined,
        },
      );
      if (submitted === false) {
        return false;
      }
      methods.reset();
    },
    [
      ask,
      methods,
      addedConvo,
      conversation,
      setMessages,
      getMessages,
      latestMessage,
      isAuthenticated,
      localize,
      showToast,
      navigate,
      location,
    ],
  );

  const submitPrompt = useCallback(
    (text: string) => {
      const parsedText = replaceSpecialVars({ text, user });
      if (autoSendPrompts) {
        submitMessage({ text: parsedText });
        return;
      }

      const textarea = document.getElementById(mainTextareaId) as HTMLTextAreaElement | null;
      const currentText = textarea?.value ?? methods.getValues('text');
      const newText = currentText.trim().length > 1 ? `\n${parsedText}` : parsedText;
      setActivePrompt(newText);
    },
    [autoSendPrompts, submitMessage, setActivePrompt, methods, user],
  );

  return { submitMessage, submitPrompt };
}
