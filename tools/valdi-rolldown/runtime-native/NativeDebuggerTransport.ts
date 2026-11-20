import {
  DaemonClientManager,
  type ReceivedDaemonClientMessage,
} from 'valdi_core/src/debugging/DaemonClientManager';
import { DaemonClientMessageType, Messages } from 'valdi_core/src/debugging/Messages';
import type { CustomMessageHandler } from 'valdi_core/src/debugging/CustomMessageHandler';

// Native providers can attach custom debugger request handlers without loading Valdi's legacy JSX renderer.
export const daemon = new DaemonClientManager();
const handlers = new Set<CustomMessageHandler>();

export const transport = {
  addCustomMessageHandler: (handler: CustomMessageHandler) => {
    handlers.add(handler);
  },
  removeCustomMessageHandler: (handler: CustomMessageHandler) => {
    handlers.delete(handler);
  },
};

daemon.addListener({
  onMessage(message: ReceivedDaemonClientMessage) {
    if (message.message.type !== DaemonClientMessageType.CUSTOM_REQUEST) return;
    const body = message.message.body;
    for (const handler of handlers) {
      const response = handler.messageReceived(body.identifier, body.data);
      if (!response) continue;
      response.then(
        (data: any) => message.respond((id: string) => Messages.customMessageResponse(id, { handled: true, data })),
        (error: unknown) =>
          message.respond((id: string) =>
            Messages.errorResponse(id, error instanceof Error ? error : new Error(String(error))),
          ),
      );
      return;
    }
    message.respond((id: string) => Messages.customMessageResponse(id, { handled: false, data: undefined }));
  },
});
