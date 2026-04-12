import type { Context } from 'hono';
import { createLogger } from '@oao/shared';

const logger = createLogger('sse');

/**
 * SSE (Server-Sent Events) event bus.
 * Manages connected clients and broadcasts events.
 */

type SSEClient = {
  id: string;
  controller: ReadableStreamDefaultController;
};

class EventBus {
  private clients: Map<string, SSEClient> = new Map();
  private clientCounter = 0;

  /** Register a new SSE client and return the stream Response */
  connect(_c: Context): Response {
    const clientId = `client-${++this.clientCounter}`;

    const stream = new ReadableStream({
      start: (controller) => {
        this.clients.set(clientId, { id: clientId, controller });
        logger.info({ clientId, total: this.clients.size }, 'SSE client connected');

        // Send initial connection event
        const msg = `event: connected\ndata: ${JSON.stringify({ clientId })}\n\n`;
        controller.enqueue(new TextEncoder().encode(msg));
      },
      cancel: () => {
        this.clients.delete(clientId);
        logger.info({ clientId, total: this.clients.size }, 'SSE client disconnected');
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable nginx buffering
      },
    });
  }

  /** Broadcast an event to all connected clients */
  broadcast(event: string, data: unknown): void {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    const encoded = new TextEncoder().encode(message);

    for (const [clientId, client] of this.clients) {
      try {
        client.controller.enqueue(encoded);
      } catch {
        // Client disconnected — clean up
        this.clients.delete(clientId);
      }
    }
  }

  /** Get the number of connected clients */
  get connectionCount(): number {
    return this.clients.size;
  }
}

// Singleton event bus instance
export const agentEventBus = new EventBus();
