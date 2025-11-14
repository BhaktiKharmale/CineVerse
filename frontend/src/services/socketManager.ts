import { aiChatService } from "./aiChatService";

type Disconnectable = {
  disconnect: () => void;
};

const registeredSockets = new Set<Disconnectable>();

export const socketManager = {
  register(socket: Disconnectable) {
    registeredSockets.add(socket);
  },
  unregister(socket: Disconnectable) {
    registeredSockets.delete(socket);
  },
  disconnectAll() {
    registeredSockets.forEach((socket) => {
      try {
        socket.disconnect();
      } catch (error) {
        console.error("[socketManager] Failed to disconnect socket", error);
      }
    });
    registeredSockets.clear();

    // Ensure AI chat namespace is disconnected even if not registered explicitly.
    try {
      aiChatService.disconnect();
    } catch (error) {
      console.error("[socketManager] Failed to disconnect aiChatService", error);
    }
  },
};

// Pre-register known singleton sockets.
socketManager.register(aiChatService);

