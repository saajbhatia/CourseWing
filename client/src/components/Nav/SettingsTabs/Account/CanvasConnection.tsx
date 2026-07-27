import { useState } from 'react';
import { AxiosError } from 'axios';
import { Link2, Loader2 } from 'lucide-react';
import { Input, Button, Spinner, useToastContext } from '@librechat/client';
import {
  useCanvasConnectionQuery,
  useConnectCanvasMutation,
  useDisconnectCanvasMutation,
  useConnectGoogleClassroomMutation,
} from '~/data-provider/CourseWing';
import { useLocalize } from '~/hooks';

function connectErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof AxiosError) {
    const serverMessage = (error.response?.data as { message?: string } | undefined)?.message;
    if (serverMessage) {
      return serverMessage;
    }
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

function hostOf(baseUrl?: string): string | null {
  if (!baseUrl) {
    return null;
  }
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}

export default function CanvasConnection() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [token, setToken] = useState('');
  const [domain, setDomain] = useState('');

  const connection = useCanvasConnectionQuery();
  const connectMutation = useConnectCanvasMutation();
  const disconnectMutation = useDisconnectCanvasMutation();
  const googleMutation = useConnectGoogleClassroomMutation();

  const handleGoogleConnect = () => {
    googleMutation.mutate(undefined, {
      onError: (error) => {
        showToast({
          status: 'error',
          message: connectErrorMessage(error, localize('com_ui_classroom_connect_error')),
        });
      },
    });
  };

  const handleConnect = () => {
    if (!token.trim()) {
      return;
    }

    connectMutation.mutate(
      { token: token.trim(), baseUrl: domain.trim() || undefined },
      {
        onSuccess: (data) => {
          setToken('');
          setDomain('');
          showToast({
            status: 'success',
            message: localize('com_ui_canvas_connected_as', { 0: data.userName ?? 'Canvas' }),
          });
        },
        onError: (error) => {
          showToast({
            status: 'error',
            message: connectErrorMessage(error, localize('com_ui_canvas_connect_error')),
          });
        },
      },
    );
  };

  const handleDisconnect = () => {
    disconnectMutation.mutate(undefined, {
      onSuccess: () =>
        showToast({ status: 'success', message: localize('com_ui_canvas_disconnected') }),
      onError: (error) =>
        showToast({
          status: 'error',
          message: connectErrorMessage(error, localize('com_ui_canvas_disconnect_error')),
        }),
    });
  };

  if (connection.isLoading) {
    return <Spinner className="h-4 w-4" />;
  }

  if (connection.isError) {
    return (
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-red-600 dark:text-red-400">
          {connectErrorMessage(connection.error, localize('com_ui_canvas_status_error'))}
        </span>
        <Button size="sm" variant="outline" onClick={() => void connection.refetch()}>
          {localize('com_ui_retry')}
        </Button>
      </div>
    );
  }

  if (connection.data?.enabled === false) {
    return null;
  }

  const connectForm = (
    <div className="flex flex-col gap-2">
      <Input
        type="text"
        value={domain}
        onChange={(event) => setDomain(event.target.value)}
        placeholder={localize('com_ui_canvas_domain_placeholder')}
        className="h-9"
        aria-label={localize('com_ui_canvas_domain_placeholder')}
      />
      <div className="flex items-center gap-2">
        <Input
          type="password"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          placeholder={localize('com_ui_canvas_token_placeholder')}
          className="h-9 flex-1"
          aria-label={localize('com_ui_canvas_token_placeholder')}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              handleConnect();
            }
          }}
        />
        <Button
          size="sm"
          onClick={handleConnect}
          disabled={!token.trim() || connectMutation.isLoading}
          aria-label={localize('com_ui_canvas_connect')}
        >
          {connectMutation.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Link2 className="h-4 w-4" aria-hidden="true" />
          )}
          {localize('com_ui_canvas_connect')}
        </Button>
      </div>
      <span className="text-xs text-text-secondary">{localize('com_ui_canvas_token_help')}</span>
      <div className="flex items-center gap-2">
        <span className="text-xs text-text-secondary">{localize('com_ui_classroom_or')}</span>
        <Button
          size="sm"
          variant="outline"
          onClick={handleGoogleConnect}
          disabled={googleMutation.isLoading}
          aria-label={localize('com_ui_classroom_connect')}
        >
          {googleMutation.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Link2 className="h-4 w-4" aria-hidden="true" />
          )}
          {localize('com_ui_classroom_connect')}
        </Button>
      </div>
    </div>
  );

  if (connection.data?.connected === true) {
    const { userName, courseCount, syncing, lastSyncAt, lastSyncError, baseUrl, isDefault, provider } =
      connection.data;
    const syncFailed = syncing !== true && lastSyncAt == null && Boolean(lastSyncError);
    const host =
      provider === 'google' ? localize('com_ui_classroom_source_label') : hostOf(baseUrl);
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm text-text-primary">
              {localize('com_ui_canvas_connected_as', { 0: userName ?? 'Canvas' })}
              {host != null && <span className="text-text-secondary"> · {host}</span>}
            </span>
            <span className="text-xs text-text-secondary">
              {syncing === true ? (
                <span className="flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                  {localize('com_ui_canvas_syncing', { 0: String(courseCount ?? 0) })}
                </span>
              ) : syncFailed ? (
                <span className="text-red-600 dark:text-red-400">
                  {localize('com_ui_canvas_sync_failed')}
                </span>
              ) : (
                localize('com_ui_canvas_sync_status', {
                  0: String(courseCount ?? 0),
                  1: lastSyncAt ? new Date(lastSyncAt).toLocaleString() : '—',
                })
              )}
            </span>
          </div>
          {isDefault !== true && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDisconnect}
              disabled={disconnectMutation.isLoading}
              aria-label={localize('com_ui_canvas_disconnect')}
            >
              {localize('com_ui_canvas_disconnect')}
            </Button>
          )}
        </div>
        {isDefault === true && connectForm}
      </div>
    );
  }

  return connectForm;
}
