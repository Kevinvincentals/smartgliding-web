import { WebSocket, WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { broadcastToClients, sendFlarmStatusToClient, broadcastToChannel } from '@/lib/websocket/utils';
import { PrismaClient } from '@prisma/client';
import { verifyToken, JWTPayload } from '@/lib/jwt'; // Import JWT verification utilities
import { parse } from 'cookie'; // Import cookie parser

// Initialize Prisma client
const prisma = new PrismaClient();

// Default plane tracker WebSocket URL for development if not specified in environment
const PLANE_TRACKER_WS_URL = process.env.PLANE_TRACKER_WS_URL || 'ws://127.0.0.1:8765';

// AUTH_PASSWORD constant is removed as we are switching to JWT based auth

// Define client information structure
interface ClientInfo {
  isAuthenticated: boolean;
  mainChannel: string | null; // e.g., 'EKFS', 'EKAB' (will be homefield from JWT)
  subscribedTopics: Set<string>; // e.g., 'plane-tracker'
  clientId: string;
  clubId?: string; // Store clubId from JWT for potential use
}

// FLARM status constants
const FLARM_CACHE_TTL = 10 * 60 * 1000; // 10 minutes in milliseconds
const FLARM_OFFLINE_THRESHOLD = 45 * 60 * 1000; // 45 minutes in milliseconds

// Use global object to persist connections across hot reloads
declare global {
  namespace NodeJS {
    interface Global {
      wsClients: Map<WebSocket, ClientInfo> | undefined;
      wsServer: WebSocketServer | null | undefined;
      planeTrackerSocket: WebSocket | null | undefined;
      planeData: any[] | undefined;
      planeTrackerConnectTimer: NodeJS.Timeout | null | undefined;
      flarmStatusCache: Map<string, { status: 'online' | 'offline', timestamp: number }> | undefined;
    }
  }
}

// Initialize global stores only if they haven't been initialized yet
if (!(global as any).wsClients) {
  (global as any).wsClients = new Map<WebSocket, ClientInfo>();
  console.log("Initialized global WebSocket clients store (with ClientInfo for JWT auth)");
}
if (!(global as any).planeData) {
  (global as any).planeData = [];
}
if (!(global as any).flarmStatusCache) {
  (global as any).flarmStatusCache = new Map();
}

// Utility function to count authenticated clients subscribed to a specific topic
function countClientsSubscribedToTopic(topic: string): number {
  let count = 0;
  (global as any).wsClients?.forEach((clientInfo: ClientInfo) => {
    if (clientInfo.isAuthenticated && clientInfo.subscribedTopics.has(topic)) {
      count++;
    }
  });
  return count;
}

// Function to check FLARM status from database
async function checkFlarmStatus(flarmId: string): Promise<'online' | 'offline'> {
  const cached = (global as any).flarmStatusCache?.get(flarmId);
  const now = Date.now();
  
  if (cached && (now - cached.timestamp) < FLARM_CACHE_TTL) {
    console.log(`Using cached FLARM status for ${flarmId}: ${cached.status}`);
    return cached.status;
  }
  
  try {
    const latestFlarmData = await prisma.flarmData.findFirst({
      where: {
        aircraft_id: flarmId
      },
      orderBy: {
        mongodb_timestamp: 'desc'
      }
    });
    
    let status: 'online' | 'offline';
    
    if (!latestFlarmData) {
      console.log(`No FLARM data found for ${flarmId}`);
      status = 'offline';
    } else {
      const flarmTimestamp = new Date(latestFlarmData.mongodb_timestamp).getTime();
      const timeDiff = now - flarmTimestamp;
      
      status = timeDiff < FLARM_OFFLINE_THRESHOLD ? 'online' : 'offline';
      console.log(`FLARM ${flarmId} last seen ${timeDiff / 60000} minutes ago, status: ${status}`);
    }
    
    (global as any).flarmStatusCache?.set(flarmId, { status, timestamp: now });
    
    return status;
  } catch (error) {
    console.error(`Error checking FLARM status for ${flarmId}:`, error);
    return 'offline'; // Default to offline in case of errors
  }
}

// Function to connect to the plane tracker WebSocket
function connectToPlaneTracker() {
  if ((global as any).planeTrackerConnectTimer) {
    clearTimeout((global as any).planeTrackerConnectTimer);
    (global as any).planeTrackerConnectTimer = null;
  }

  if ((global as any).planeTrackerSocket && (global as any).planeTrackerSocket.readyState === WebSocket.OPEN) {
    console.log('Already connected to plane tracker');
    return;
  }

  console.log(`Connecting to plane tracker WebSocket at ${PLANE_TRACKER_WS_URL}...`);
  try {
    const socket = new WebSocket(PLANE_TRACKER_WS_URL);

    socket.on('open', () => {
      console.log(`✅ Successfully connected to plane tracker WebSocket server at ${PLANE_TRACKER_WS_URL}`);
      (global as any).planeTrackerSocket = socket;
    });

    socket.on('message', (data) => {
      console.log(`📊 Received from plane tracker: ${data.toString().substring(0, 100)}...`);
      try {
        if (!(global as any).planeData) {
          (global as any).planeData = [];
        }
        
        if (data.toString().startsWith('{')) {
          const jsonData = JSON.parse(data.toString());
          
          if (jsonData.type === 'aircraft_data' && Array.isArray(jsonData.data)) {
            (global as any).planeData = jsonData.data;
            console.log(`Received ${jsonData.data.length} aircraft from plane tracker`);
          } else if (jsonData.type === 'adsb_aircraft_data' && Array.isArray(jsonData.data)) {
            // Handle ADSB aircraft data - merge with existing plane data
            if (!(global as any).planeData) {
              (global as any).planeData = [];
            }
            // Add ADSB aircraft to the existing plane data
            jsonData.data.forEach((adsbAircraft: any) => {
              const existingIndex = (global as any).planeData.findIndex((a: any) => a.id === adsbAircraft.aircraft_id || a.aircraft_id === adsbAircraft.aircraft_id);
              if (existingIndex >= 0) {
                (global as any).planeData[existingIndex] = adsbAircraft;
              } else {
                (global as any).planeData.push(adsbAircraft);
              }
            });
            console.log(`Received ${jsonData.data.length} ADSB aircraft from plane tracker`);
          } else if (jsonData.type === 'aircraft_update' && jsonData.data) {
            const aircraftId = jsonData.data.id;
            const existingIndex = (global as any).planeData.findIndex((a: any) => a.id === aircraftId);
            if (existingIndex >= 0) {
              (global as any).planeData[existingIndex] = jsonData.data;
            } else {
              (global as any).planeData.push(jsonData.data);
            }
          } else if (jsonData.type === 'adsb_aircraft_update' && jsonData.data) {
            const aircraftId = jsonData.data.aircraft_id || jsonData.data.id;
            const existingIndex = (global as any).planeData.findIndex((a: any) => a.id === aircraftId || a.aircraft_id === aircraftId);
            if (existingIndex >= 0) {
              (global as any).planeData[existingIndex] = jsonData.data;
            } else {
              (global as any).planeData.push(jsonData.data);
            }
          } else if (jsonData.type === 'aircraft_removed' && jsonData.data && jsonData.data.id) {
            const aircraftId = jsonData.data.id;
            (global as any).planeData = (global as any).planeData.filter((a: any) => a.id !== aircraftId);
          } else if (jsonData.type === 'adsb_aircraft_removed' && jsonData.data && (jsonData.data.id || jsonData.data.aircraft_id)) {
            const aircraftId = jsonData.data.aircraft_id || jsonData.data.id;
            (global as any).planeData = (global as any).planeData.filter((a: any) => a.id !== aircraftId && a.aircraft_id !== aircraftId);
          }
        }
        
        broadcastDataToSubscribedPlaneTrackers(data.toString());
      } catch (e) {
        console.log(`💓 Heartbeat from plane tracker: ${data.toString()}`);
        broadcastDataToSubscribedPlaneTrackers(data.toString());
      }
    });

    socket.on('close', (code, reason) => {
      console.log(`❌ Disconnected from plane tracker WebSocket server (code: ${code}, reason: ${reason || 'unknown'})`);
      (global as any).planeTrackerSocket = null;
      
      if (countClientsSubscribedToTopic('plane-tracker') > 0) {
        console.log('⏱️ Scheduling reconnection attempt in 5 seconds...');
        (global as any).planeTrackerConnectTimer = setTimeout(connectToPlaneTracker, 5000);
      } else {
        console.log("No clients subscribed to 'plane-tracker', not reconnecting");
      }
    });

    socket.on('error', (error) => {
      console.error('🔴 Plane tracker WebSocket error:', error);
      socket.close();
    });

  } catch (error) {
    console.error('🔴 Failed to connect to plane tracker:', error);
    if (countClientsSubscribedToTopic('plane-tracker') > 0) {
      console.log('⏱️ Scheduling reconnection attempt in 5 seconds...');
      (global as any).planeTrackerConnectTimer = setTimeout(connectToPlaneTracker, 5000);
    }
  }
}

function disconnectFromPlaneTracker() {
  if (!(global as any).planeTrackerSocket) return;

  console.log("Disconnecting from plane tracker (no clients subscribed to 'plane-tracker')");
  
  try {
    (global as any).planeTrackerSocket.close();
    (global as any).planeTrackerSocket = null;
  } catch (error) {
    console.error('Error disconnecting from plane tracker:', error);
  }
  
  if ((global as any).planeTrackerConnectTimer) {
    clearTimeout((global as any).planeTrackerConnectTimer);
    (global as any).planeTrackerConnectTimer = null;
  }
}

function manageTrackerConnection() {
  const planeTrackerSubscribersCount = countClientsSubscribedToTopic('plane-tracker');
  console.log(`Managing plane tracker connection. Active plane tracker subscribers: ${planeTrackerSubscribersCount}`);
  
  if (planeTrackerSubscribersCount > 0) {
    if (!(global as any).planeTrackerSocket || (global as any).planeTrackerSocket.readyState !== WebSocket.OPEN) {
      connectToPlaneTracker();
    }
  } else {
    disconnectFromPlaneTracker();
  }
}

function broadcastDataToSubscribedPlaneTrackers(message: string | object) {
  const messageString = typeof message === 'string' ? message : JSON.stringify(message);
  
  if (!(global as any).wsClients?.size) {
    return;
  }
  
  let activeClientCount = 0;
  let failedClientCount = 0;
  const clientsToRemove: WebSocket[] = [];
  
  (global as any).wsClients.forEach((clientInfo: ClientInfo, client: WebSocket) => {
    if (clientInfo.isAuthenticated && clientInfo.subscribedTopics.has('plane-tracker')) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(messageString);
          activeClientCount++;
        } catch (error) {
          console.error('Error sending plane data to client:', error);
          failedClientCount++;
          clientsToRemove.push(client);
        }
      } else if (client.readyState !== WebSocket.CONNECTING) {
        clientsToRemove.push(client);
      }
    }
  });
  
  clientsToRemove.forEach(client => {
    if ((global as any).wsClients?.has(client)) {
      const clientInfo = (global as any).wsClients.get(client);
      console.log(`Cleaning up disconnected/failed plane-tracker client: ${clientInfo?.clientId}`);
      (global as any).wsClients.delete(client);
    }
  });
  
  if (clientsToRemove.length > 0) {
    console.log(`Cleaned up ${clientsToRemove.length} plane-tracker clients. Remaining total: ${(global as any).wsClients?.size}`);
    manageTrackerConnection();
  }
  
  if (activeClientCount > 0) {
    console.log(`Broadcasted plane data to ${activeClientCount} subscribed clients (failed: ${failedClientCount})`);
  }
}

/**
 * Broadcasts a message to all authenticated clients of a specific mainChannel.
 * Used for channel-specific events like takeoffs, landings.
 */
// export function broadcastToChannel(channel: string, message: string | object) {                             // THIS FUNCTION IS MOVED TO LIB/WEBSOCKET/UTILS.TS
//   const messageString = typeof message === 'string' ? message : JSON.stringify(message);
//
//   if (!global.wsClients?.size) {
//     return;
//   }
//
//   let activeClientCount = 0;
//   const clientsToRemove: WebSocket[] = [];
//
//   global.wsClients.forEach((clientInfo, client) => {
//     if (clientInfo.isAuthenticated && clientInfo.mainChannel === channel) {
//       if (client.readyState === WebSocket.OPEN) {
//         try {
//           client.send(messageString);
//           activeClientCount++;
//         } catch (error) {
//           console.error(`Error sending message to client ${clientInfo.clientId} on channel ${channel}:`, error);
//           clientsToRemove.push(client);
//         }
//       } else if (client.readyState !== WebSocket.CONNECTING) {
//         clientsToRemove.push(client);
//       }
//     }
//   });
//  
//   clientsToRemove.forEach(client => {
//      if (global.wsClients?.has(client)) {
//       const clientInfo = global.wsClients.get(client);
//       console.log(`Cleaning up disconnected/failed client ${clientInfo?.clientId} from channel ${channel} broadcast`);
//       global.wsClients.delete(client);
//     }
//   });
//
//   if (activeClientCount > 0) {
//     console.log(`Broadcasted message to ${activeClientCount} clients on channel ${channel}`);
//   }
// }

export function SOCKET(
  client: WebSocket,
  request: IncomingMessage,
  server: WebSocketServer
) {
  try {
    if (!(global as any).wsServer) {
      (global as any).wsServer = server;
    }
    
    const clientId = `${request.socket.remoteAddress}:${request.socket.remotePort}`;
    
    if ((global as any).wsClients?.has(client)) {
      console.log(`Client ${clientId} already connected, this might be a bug or HMR artifact. Overwriting.`);
    }
    
    console.log(`Client ${clientId} connecting...`);
    
    const clientInfo: ClientInfo = {
      isAuthenticated: false,
      mainChannel: null,
      subscribedTopics: new Set(),
      clientId: clientId,
      clubId: undefined,
    };
    (global as any).wsClients?.set(client, clientInfo);
    console.log(`Client ${clientId} added to registry. Total clients: ${(global as any).wsClients?.size}.`);
    
    let authenticatedViaCookie = false;
    const cookieHeader = request.headers.cookie;
    if (cookieHeader) {
      const cookies = parse(cookieHeader);
      const accessTokenCookieName = process.env.TABLET_ACCESS_TOKEN_COOKIE_NAME || 'tablet-access-token';
      const token = cookies[accessTokenCookieName];

      if (token) {
        console.log(`Client ${clientId} attempting JWT authentication via cookie.`);
        verifyToken(token).then(decodedPayload => {
          if (!decodedPayload.id || (!decodedPayload.selectedAirfield && !decodedPayload.homefield)) {
            console.warn(`Client ${clientId} cookie JWT auth failed: token missing id or airfield. Payload:`, decodedPayload);
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({ type: 'auth_failure', message: 'Invalid token payload from cookie.' }));
            }
            return;
          }

          clientInfo.isAuthenticated = true;
          clientInfo.mainChannel = decodedPayload.selectedAirfield || decodedPayload.homefield || null;
          clientInfo.clubId = decodedPayload.id;
          authenticatedViaCookie = true;
          console.log(`Client ${clientId} authenticated via cookie. Club ID: ${clientInfo.clubId}, Channel: ${clientInfo.mainChannel}`);
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ 
              type: 'auth_success', 
              channel: clientInfo.mainChannel, 
              clubId: clientInfo.clubId,
              clientId: clientInfo.clientId 
            }));
          }
        }).catch(jwtError => {
          console.warn(`Client ${clientId} cookie JWT auth failed: token verification error.`, jwtError);
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'auth_failure', message: 'Invalid or expired token from cookie.' }));
          }
        });
      } else {
        console.log(`Client ${clientId}: No access token cookie ('${accessTokenCookieName}') found.`);
      }
    } else {
      console.log(`Client ${clientId}: No cookies found in handshake request.`);
    }

    setTimeout(() => {
      if (!clientInfo.isAuthenticated && client.readyState === WebSocket.OPEN) {
        console.log(`Client ${clientId} not authenticated via cookie, sending auth_required.`);
        client.send(JSON.stringify({ type: 'auth_required', message: 'Authentication via cookie failed or not attempted. Please ensure you are logged in.' }));
      }
    }, 1000);
    
    client.on("close", (code, reason) => {
      const currentClientInfo = (global as any).wsClients?.get(client);
      if (currentClientInfo) {
        (global as any).wsClients?.delete(client);
        console.log(`Client ${currentClientInfo.clientId} disconnected (code: ${code}, reason: ${reason || 'none'}). Authenticated: ${currentClientInfo.isAuthenticated}, Channel: ${currentClientInfo.mainChannel}. Remaining clients: ${(global as any).wsClients?.size}`);
      } else {
        console.log(`Unknown client disconnected (code: ${code}, reason: ${reason || 'none'}). Remaining clients: ${(global as any).wsClients?.size}`);
      }
      
      manageTrackerConnection();
    });
    
    client.on("message", async (message: Buffer) => {
      const msgStr = message.toString();
      const currentClientInfo = (global as any).wsClients?.get(client);

      if (!currentClientInfo) {
        console.error(`Received message from a client not in registry: ${clientId}. Message: ${msgStr.substring(0,100)}`);
        client.close(1008, "Client not registered");
        return;
      }
      
      try {
        const data = JSON.parse(msgStr);
        
        if (!currentClientInfo.isAuthenticated) {
          console.log(`Client ${currentClientInfo.clientId} sent message type '${data.type}' before authenticating. Message ignored: ${msgStr.substring(0,100)}`);
          if (!authenticatedViaCookie) {
             client.send(JSON.stringify({ type: 'error', message: 'Authentication required. Please ensure cookies are enabled and you are logged in.' }));
          }
          return;
        }
        
        if (data.type === 'ping') {
          client.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          return;
        }
        
        if (data.type === 'flarm_status_request' && data.flarmId) {
          console.log(`Client ${currentClientInfo.clientId} requested FLARM status for ${data.flarmId}`);
          const status = await checkFlarmStatus(data.flarmId);
          sendFlarmStatusToClient(client, data.flarmId, status);
          return;
        }
        
        if (data.type === 'flarm_status_batch_request' && Array.isArray(data.flarmIds)) {
          console.log(`Client ${currentClientInfo.clientId} requested batch FLARM status for ${data.flarmIds.length} IDs`);
          const responses = await Promise.all(
            data.flarmIds.map(async (flarmId: string) => {
              const status = await checkFlarmStatus(flarmId);
              return { flarmId, status };
            })
          );
          client.send(JSON.stringify({
            type: 'flarm_status_batch_response',
            statuses: responses,
            timestamp: Date.now()
          }));
          return;
        }
        
        if (data.type === 'subscribe' && data.channel) {
          console.log(`Client ${currentClientInfo.clientId} attempting to subscribe to topic: ${data.channel}`);
          
          if (data.channel === 'plane-tracker') {
            currentClientInfo.subscribedTopics.add('plane-tracker');
            console.log(`Client ${currentClientInfo.clientId} subscribed to plane tracker data. Main channel: ${currentClientInfo.mainChannel}`);
            client.send(JSON.stringify({ 
              type: 'subscription_ack', 
              topic: 'plane-tracker', 
              status: 'subscribed' 
            }));
            
            if ((global as any).planeData && (global as any).planeData.length > 0) {
              client.send(JSON.stringify({ 
                type: 'aircraft_data', 
                data: (global as any).planeData 
              }));
            }
            manageTrackerConnection();
          } else {
            console.log(`Client ${currentClientInfo.clientId} tried to subscribe to unhandled topic: ${data.channel}`);
             client.send(JSON.stringify({ 
              type: 'subscription_nak',
              topic: data.channel, 
              status: 'topic_not_available' 
            }));
          }
          return;
        }
        
        if (data.type === 'unsubscribe' && data.channel) {
           console.log(`Client ${currentClientInfo.clientId} attempting to unsubscribe from topic: ${data.channel}`);
           
          if (data.channel === 'plane-tracker') {
            currentClientInfo.subscribedTopics.delete('plane-tracker');
            console.log(`Client ${currentClientInfo.clientId} unsubscribed from plane tracker data.`);
            client.send(JSON.stringify({ 
              type: 'subscription_ack', 
              topic: 'plane-tracker', 
              status: 'unsubscribed' 
            }));
            manageTrackerConnection();
          } else {
            console.log(`Client ${currentClientInfo.clientId} tried to unsubscribe from unhandled topic: ${data.channel}`);
            client.send(JSON.stringify({ 
              type: 'subscription_nak',
              topic: data.channel, 
              status: 'topic_not_available' 
            }));
          }
          return;
        }
        
        if (data.type === 'disconnect') {
          console.log(`Client ${currentClientInfo.clientId} sent explicit disconnect: ${data.message || 'No reason provided'}`);
          client.send(JSON.stringify({ type: 'disconnect_ack' }));
          client.close(); 
          return;
        }
        
        console.log(`Client ${currentClientInfo.clientId} (Channel: ${currentClientInfo.mainChannel}) sent message: ${msgStr.substring(0, 100)}`);
        
        if (data.type === 'echo') {
          client.send(msgStr);
        } else {
          console.warn(`Unhandled message type '${data.type}' from ${currentClientInfo.clientId}`);
          client.send(JSON.stringify({ type: 'error', message: `Unhandled message type: ${data.type}`}));
        }
      } catch (e) {
        const clientDetail = currentClientInfo ? `Client ${currentClientInfo.clientId} (Channel: ${currentClientInfo.mainChannel})` : `Client ${clientId}`;
        console.log(`${clientDetail} sent non-JSON or unparsable message: ${msgStr.substring(0, 100)}. Error: ${e}`);
        client.send(JSON.stringify({ type: 'error', message: 'Invalid message format or server processing error.' }));
      }
    });
    
    client.on("error", (error) => {
      const currentClientInfo = (global as any).wsClients?.get(client);
      const logClientId = currentClientInfo ? currentClientInfo.clientId : clientId;
      console.error(`WebSocket client ${logClientId} error:`, error);
      try {
        if (client.readyState === WebSocket.OPEN || client.readyState === WebSocket.CONNECTING) {
           client.close(1011, "Internal server error reported by client error event");
        }
      } catch (e) {
        console.error(`Error while trying to close errored client ${logClientId}:`, e);
      }
    });
  } catch (error) {
    console.error("Error in SOCKET handler initial setup:", error);
    try {
      if (client && (client.readyState === WebSocket.OPEN || client.readyState === WebSocket.CONNECTING)) {
        client.close(1011, "Server handler error during setup");
      }
    } catch (e) {
      console.error("Error while closing client after initial handler error:", e);
    }
  }
} 