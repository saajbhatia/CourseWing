import { useState } from 'react';
import { MessageSquareHeart } from 'lucide-react';
import { Button, Checkbox, OGDialog, DialogTemplate, useToastContext } from '@librechat/client';
import { Constants } from 'librechat-data-provider';
import { useSendFeedbackMutation } from '~/data-provider/LearnLight';
import { useLocalize } from '~/hooks';
import { useChatContext } from '~/Providers';
import { cn } from '~/utils';
import { pillButtonClassName } from './utils';

export default function FeedbackButton() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { conversation, latestMessageId } = useChatContext();
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [shareChat, setShareChat] = useState(false);
  const sendFeedback = useSendFeedbackMutation();

  const conversationId =
    conversation?.conversationId && conversation.conversationId !== Constants.NEW_CONVO
      ? conversation.conversationId
      : null;
  const canShareChat = conversationId != null && latestMessageId != null;

  const handleSubmit = () => {
    if (!message.trim() || sendFeedback.isLoading) {
      return;
    }
    const willShareChat = shareChat && canShareChat;
    sendFeedback.mutate(
      {
        message: message.trim(),
        shareChat: willShareChat,
        conversationId: willShareChat ? conversationId : null,
        targetMessageId: willShareChat ? latestMessageId : null,
      },
      {
        onSuccess: (result) => {
          setIsOpen(false);
          setMessage('');
          setShareChat(false);
          if (result.warning === 'chat_share_failed') {
            showToast({
              message: localize('com_ui_app_feedback_chat_share_failed'),
              status: 'warning',
            });
          } else {
            showToast({ message: localize('com_ui_app_feedback_thanks') });
          }
        },
        onError: () => {
          showToast({ message: localize('com_ui_app_feedback_error'), status: 'error' });
        },
      },
    );
  };

  return (
    <>
      <button
        type="button"
        aria-label={localize('com_ui_app_feedback')}
        onClick={() => setIsOpen(true)}
        className={pillButtonClassName}
      >
        <span className="icon-md text-text-primary">
          <MessageSquareHeart className="icon-md" aria-hidden="true" />
        </span>
        <span className="hidden truncate md:block">{localize('com_ui_app_feedback')}</span>
      </button>
      <OGDialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTemplate
          title={localize('com_ui_app_feedback_title')}
          className="w-11/12 max-w-lg"
          main={
            <div className="flex flex-col gap-3">
              <label htmlFor="learnlight-feedback-message" className="text-sm text-text-secondary">
                {localize('com_ui_app_feedback_prompt')}
              </label>
              <textarea
                id="learnlight-feedback-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                maxLength={10000}
                placeholder={localize('com_ui_app_feedback_placeholder')}
                className="w-full resize-none rounded-lg border border-border-medium bg-transparent p-2.5 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <div className="flex items-center gap-2">
                <Checkbox
                  id="learnlight-feedback-share"
                  aria-labelledby="learnlight-feedback-share-label"
                  checked={shareChat}
                  onCheckedChange={(checked) => setShareChat(checked === true)}
                  disabled={!canShareChat}
                />
                <label
                  id="learnlight-feedback-share-label"
                  htmlFor="learnlight-feedback-share"
                  className={cn('text-sm text-text-primary', !canShareChat && 'text-text-tertiary')}
                >
                  {!canShareChat
                    ? localize('com_ui_app_feedback_share_chat_unavailable')
                    : localize('com_ui_app_feedback_share_chat')}
                </label>
              </div>
            </div>
          }
          buttons={
            <Button onClick={handleSubmit} disabled={!message.trim() || sendFeedback.isLoading}>
              {sendFeedback.isLoading
                ? localize('com_ui_app_feedback_sending')
                : localize('com_ui_app_feedback_send')}
            </Button>
          }
        />
      </OGDialog>
    </>
  );
}
