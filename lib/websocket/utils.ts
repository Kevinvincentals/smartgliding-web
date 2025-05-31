import { WebSocket } from 'ws';

// Define client information structure (must match app/api/ws/route.ts)
interface ClientInfo {
  isAuthenticated: boolean;
  mainChannel: string | null;
  subscribedTopics: Set<string>;
  clientId: string; // For logging, matches the one in route.ts
}

// Make sure global types are defined, consistent with app/api/ws/route.ts
declare global {
  var wsClients: Map<WebSocket, ClientInfo> | undefined;
  var flarmStatusCache: Map<string, { status: 'online' | 'offline', timestamp: number }> | undefined;
}

// Initialize the FLARM status cache if it doesn't exist (idempotent)
if (!global.flarmStatusCache) {
  global.flarmStatusCache = new Map();
}

/**
 * Broadcasts a message to WebSocket clients based on authentication and optional channel.
 * If targetChannel is provided, sends only to authenticated clients in that channel.
 * If targetChannel is not provided, sends to all authenticated clients.
 */
export function broadcastToClients(message: string | object, targetChannel?: string) {
  const messageString = typeof message === 'string' ? message : JSON.stringify(message);
  
  if (!global.wsClients?.size) {
    console.log('No connected WebSocket clients to broadcast to');
    return;
  }
  
  let inferredChannel: string | undefined = targetChannel;

  // If no explicit targetChannel, try to infer from message content for webhooks
  if (!inferredChannel && typeof message === 'object' && message !== null && 'type' in message && message.type === 'webhook') {
    const webhookData = (message as any).data;
    if (webhookData) {
      if (typeof webhookData.airfield === 'string' && webhookData.airfield) {
        inferredChannel = webhookData.airfield;
        console.log(`Inferred channel '${inferredChannel}' from webhook message data.airfield`);
      } else if (typeof webhookData.takeoff_airfield === 'string' && webhookData.takeoff_airfield) {
        inferredChannel = webhookData.takeoff_airfield;
        console.log(`Inferred channel '${inferredChannel}' from webhook message data.takeoff_airfield`);
      } else if (typeof webhookData.landing_airfield === 'string' && webhookData.landing_airfield) {
        inferredChannel = webhookData.landing_airfield;
        console.log(`Inferred channel '${inferredChannel}' from webhook message data.landing_airfield`);
      } 
      // Future: Could add clubId to homefield lookup here if necessary, but it makes this util async.
      // For now, relying on explicit airfield properties in the webhook data.
      if (!inferredChannel && typeof webhookData.clubId === 'string') {
        // This is where you MIGHT do a DB lookup if no direct airfield is present.
        // For this change, we'll log that it's not handled by simple inference.
        console.log(`Webhook for clubId ${webhookData.clubId} received, but no direct airfield property found for channel inference in broadcastToClients.`);
      }
    }
  }
  
  let activeClientCount = 0;
  let failedClientCount = 0;
  const clientsToRemove: WebSocket[] = [];
  
  global.wsClients.forEach((clientInfo, client) => {
    let shouldSend = false;
    if (clientInfo.isAuthenticated) {
      if (inferredChannel) { // Use inferredChannel (which includes original targetChannel if provided)
        if (clientInfo.mainChannel === inferredChannel) {
          shouldSend = true;
        }
      } else {
        // No target channel explicitly provided AND none could be inferred from message.
        // Broadcast to all authenticated clients (maintains previous behavior for non-webhook or uninferrable messages).
        console.log("Broadcasting to all authenticated clients as no specific target/inferred channel was determined.");
        shouldSend = true;
      }
    }

    if (shouldSend) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(messageString);
          activeClientCount++;
        } catch (error) {
          console.error(`Error sending message to client ${clientInfo.clientId}:`, error);
          failedClientCount++;
          clientsToRemove.push(client);
        }
      } else if (client.readyState !== WebSocket.CONNECTING) {
        console.log(`Client ${clientInfo.clientId} not OPEN (state: ${client.readyState}), adding to removal list during broadcast.`);
        clientsToRemove.push(client);
      }
    } else if (client.readyState !== WebSocket.OPEN && client.readyState !== WebSocket.CONNECTING) {
      // Client is not a target and is disconnected/closed, mark for removal if not already handled
      // This helps cleanup clients that were not authenticated or not in the target channel and are also disconnected.
      if (!clientsToRemove.includes(client)) {
          console.log(`Non-target client ${clientInfo.clientId} (Auth: ${clientInfo.isAuthenticated}, Channel: ${clientInfo.mainChannel}) found disconnected (state: ${client.readyState}), marking for removal.`);
          clientsToRemove.push(client);
      }
    }
  });
  
  let removedClientCount = 0;
  for (const client of clientsToRemove) {
    if (global.wsClients?.has(client)) {
      const clientInfo = global.wsClients.get(client);
      console.log(`Cleaning up client ${clientInfo?.clientId || 'unknown'} from broadcast list (state before removal: ${client.readyState})`);
      global.wsClients.delete(client);
      removedClientCount++;
    }
  }
  
  if (removedClientCount > 0) {
    console.log(`Cleaned up ${removedClientCount} clients during broadcast. Remaining total: ${global.wsClients?.size}`);
    // If using manageTrackerConnection from route.ts, it might need to be called here if client removal affects it.
    // However, broadcastToClients is generic; specific connection management should be in route.ts handlers.
  }
  
  const finalTargetInfo = inferredChannel ? `channel ${inferredChannel}` : 'all authenticated clients (or uninferrable webhook)';
  console.log(`Broadcasted message to ${activeClientCount} clients on ${finalTargetInfo} (failed: ${failedClientCount})`);
  
  if (typeof message === 'object') {
    const eventType = (message as any).event || (message as any).type || 'unknown';
    console.log(`Broadcasted message type: ${eventType}`);
  }
} 

/**
 * Sends a FLARM status response to a specific client
 */
export function sendFlarmStatusToClient(client: WebSocket, flarmId: string, status: 'online' | 'offline') {
  // Authentication should be checked before calling this function (e.g., in the route handler)
  if (client.readyState !== WebSocket.OPEN) {
    console.log(`Cannot send FLARM status to client (state: ${client.readyState}), client not open.`);
    return;
  }
  
  try {
    const message = JSON.stringify({
      type: 'flarm_status',
      flarmId,
      status,
      timestamp: Date.now()
    });
    
    client.send(message);
    // Avoid logging clientInfo here as it might be stale if client disconnected right after readyState check
    console.log(`Sent FLARM status to specific client: ${flarmId} is ${status}`);
  } catch (error) {
    console.error(`Error sending FLARM status to specific client for ${flarmId}:`, error);
  }
} 

/**
 * Broadcasts a message to all authenticated clients of a specific mainChannel.
 * Used for channel-specific events like takeoffs, landings.
 */
export function broadcastToChannel(channel: string, message: string | object) {
  const messageString = typeof message === 'string' ? message : JSON.stringify(message);

  if (!global.wsClients?.size) {
    return;
  }

  let activeClientCount = 0;
  const clientsToRemove: WebSocket[] = [];

  global.wsClients.forEach((clientInfo, client) => {
    if (clientInfo.isAuthenticated && clientInfo.mainChannel === channel) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(messageString);
          activeClientCount++;
        } catch (error) {
          console.error(`Error sending message to client ${clientInfo.clientId} on channel ${channel}:`, error);
          clientsToRemove.push(client);
        }
      } else if (client.readyState !== WebSocket.CONNECTING) {
        clientsToRemove.push(client);
      }
    }
  });
  
  clientsToRemove.forEach(client => {
     if (global.wsClients?.has(client)) {
      const clientInfo = global.wsClients.get(client);
      console.log(`Cleaning up disconnected/failed client ${clientInfo?.clientId} from channel ${channel} broadcast`);
      global.wsClients.delete(client);
    }
  });

  if (activeClientCount > 0) {
    console.log(`Broadcasted message to ${activeClientCount} clients on channel ${channel}`);
  }
} 