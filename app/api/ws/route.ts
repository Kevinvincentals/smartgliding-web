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
const DEBUG_WEBSOCKET = process.env.DEBUG_WEBSOCKET === 'true';

// Import the FLARM resolution function
import { resolveFlarmId } from '@/lib/flarm-resolution';

// AUTH_PASSWORD constant is removed as we are switching to JWT based auth

// Define client information structure
interface ClientInfo {
  isAuthenticated: boolean;
  mainChannel: string | null; // e.g., 'EKFS', 'EKAB' (will be homefield from JWT)
  subscribedTopics: Set<string>; // e.g., 'plane-tracker'
  clientId: string;
  clubId?: string; // Store clubId from JWT for potential use
  subscribedAircraft?: string[]; // Store aircraft IDs this client is subscribed to
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
      status = 'offline';
    } else {
      const flarmTimestamp = new Date(latestFlarmData.mongodb_timestamp).getTime();
      const timeDiff = now - flarmTimestamp;

      status = timeDiff < FLARM_OFFLINE_THRESHOLD ? 'online' : 'offline';
    }
    
    (global as any).flarmStatusCache?.set(flarmId, { status, timestamp: now });
    
    return status;
  } catch (error) {
    console.error(`Error checking FLARM status for ${flarmId}:`, error);
    return 'offline'; // Default to offline in case of errors
  }
}

// Process aircraft data with FLARM resolution before broadcasting
async function processAndBroadcastAircraftData(jsonData: any) {
  try {
    // Handle different types of aircraft data
    if ((jsonData.type === 'aircraft_data' || jsonData.type === 'aircraft_batch_update') && Array.isArray(jsonData.data)) {
      // Process each aircraft to resolve FLARM IDs
      const processedAircraft = await Promise.all(jsonData.data.map(async (aircraft: any) => {
        // If no registration, try to resolve FLARM ID
        if (!aircraft.registration && aircraft.id) {
          try {
            const resolutionResult = await resolveFlarmId(aircraft.id);

            // Update aircraft with resolved registration
            if (resolutionResult.registration !== `FLARM-${aircraft.id.substring(0, 6)}`) {
              aircraft.registration = resolutionResult.registration;

              // Also update aircraft type if resolved
              if (resolutionResult.aircraftType && (!aircraft.aircraft_model || aircraft.aircraft_model === 'Unknown')) {
                aircraft.aircraft_model = resolutionResult.aircraftType;
              }

              if (DEBUG_WEBSOCKET && resolutionResult.source === 'club') {
                console.log(`✅ Resolved FLARM ${aircraft.id} to ${aircraft.registration}`);
              }
            }
          } catch (error) {
            if (DEBUG_WEBSOCKET) {
              console.error(`Failed to resolve FLARM ID ${aircraft.id}:`, error);
            }
          }
        }
        return aircraft;
      }));

      // Broadcast the processed data
      const processedMessage = {
        ...jsonData,
        data: processedAircraft
      };

      broadcastDataToSubscribedPlaneTrackers(processedMessage);
    } else if (jsonData.type === 'aircraft_update' && jsonData.data) {
      // Process single aircraft update
      const aircraft = jsonData.data;

      if (!aircraft.registration && aircraft.id) {
        try {
          const resolutionResult = await resolveFlarmId(aircraft.id);
          if (resolutionResult.registration !== `FLARM-${aircraft.id.substring(0, 6)}`) {
            aircraft.registration = resolutionResult.registration;
            if (resolutionResult.aircraftType && (!aircraft.aircraft_model || aircraft.aircraft_model === 'Unknown')) {
              aircraft.aircraft_model = resolutionResult.aircraftType;
            }
          }
        } catch (error) {
          if (DEBUG_WEBSOCKET) {
            console.error(`Failed to resolve FLARM ID ${aircraft.id}:`, error);
          }
        }
      }

      // Broadcast the processed data
      const processedMessage = {
        ...jsonData,
        data: aircraft
      };

      broadcastDataToSubscribedPlaneTrackers(processedMessage);
    } else {
      // For other data types (removed, adsb, etc.), broadcast as-is
      broadcastDataToSubscribedPlaneTrackers(jsonData);
    }
  } catch (error) {
    console.error('Error processing aircraft data:', error);
    // Fallback: broadcast original data
    broadcastDataToSubscribedPlaneTrackers(jsonData);
  }
}

// Function to connect to the plane tracker WebSocket
function connectToPlaneTracker() {
  if ((global as any).planeTrackerConnectTimer) {
    clearTimeout((global as any).planeTrackerConnectTimer);
    (global as any).planeTrackerConnectTimer = null;
  }

  if ((global as any).planeTrackerSocket && (global as any).planeTrackerSocket.readyState === WebSocket.OPEN) {
    return;
  }

  if ((global as any).planeTrackerSocket && (global as any).planeTrackerSocket.readyState === WebSocket.CONNECTING) {
    return;
  }
  try {
    if (DEBUG_WEBSOCKET) console.log(`🔌 Connecting to plane tracker WebSocket at: ${PLANE_TRACKER_WS_URL}`);
    const socket = new WebSocket(PLANE_TRACKER_WS_URL);
    // Set the global reference immediately to prevent duplicate connections
    (global as any).planeTrackerSocket = socket;

    socket.on('open', () => {
      if (DEBUG_WEBSOCKET) console.log('✅ Plane tracker WebSocket connected successfully');

      // Subscribe to get all aircraft updates
      // The plane tracker backend expects specific subscription messages
      try {
        // First, subscribe to all OGN/FLARM aircraft updates
        // The backend checks for wants_all_aircraft flag (line 88 in websocket_server.py)
        const subscribeMessage = JSON.stringify({
          type: 'subscribe_all'
        });
        socket.send(subscribeMessage);
        if (DEBUG_WEBSOCKET) console.log('📡 Sent subscribe_all message to plane tracker');

        // Also send ADSB preference if clients want it
        let wantsAdsb = false;
        (global as any).wsClients?.forEach((clientInfo: ClientInfo) => {
          if (clientInfo.subscribedTopics.has('plane-tracker')) {
            wantsAdsb = true;
          }
        });

        if (wantsAdsb) {
          const adsbMessage = JSON.stringify({
            type: 'client_wants_adsb',
            wants_adsb: true
          });
          socket.send(adsbMessage);
          if (DEBUG_WEBSOCKET) console.log('📡 Sent ADSB subscription to plane tracker');
        }
      } catch (error) {
        console.error('Failed to subscribe to plane tracker:', error);
      }

      // Send any pending aircraft subscriptions
      const allPendingAircraft: string[] = [];
      (global as any).wsClients?.forEach((clientInfo: ClientInfo) => {
        if (clientInfo.isAuthenticated && clientInfo.subscribedTopics.has('tracked_aircraft') && clientInfo.subscribedAircraft) {
          allPendingAircraft.push(...clientInfo.subscribedAircraft);
        }
      });

      // Forward all pending aircraft subscriptions to Python
      if (allPendingAircraft.length > 0) {
        setTimeout(() => {
          const uniqueAircraftIds = [...new Set(allPendingAircraft)];
          const subscriptionMessage = JSON.stringify({
            type: 'subscribe_aircraft',
            aircraft_ids: uniqueAircraftIds
          });
          socket.send(subscriptionMessage);
        }, 100); // Small delay to ensure Python is ready
      }

      // Notify all tracked_aircraft subscribers that they can re-send subscriptions
      (global as any).wsClients?.forEach((clientInfo: ClientInfo, client: WebSocket) => {
        if (clientInfo.isAuthenticated && clientInfo.subscribedTopics.has('tracked_aircraft')) {
          if (client.readyState === WebSocket.OPEN) {
            try {
              client.send(JSON.stringify({
                type: 'plane_tracker_ready'
              }));
            } catch (error) {
              console.error('Error notifying client of plane tracker ready:', error);
            }
          }
        }
      });
    });

    socket.on('message', async (data) => {
      try {
        if (DEBUG_WEBSOCKET) {
          console.log(`📥 Received data from plane tracker: ${data.toString().substring(0, 200)}...`);
        }

        if (!(global as any).planeData) {
          (global as any).planeData = [];
        }

        if (data.toString().startsWith('{')) {
          const jsonData = JSON.parse(data.toString());

          if (jsonData.type === 'aircraft_data' && Array.isArray(jsonData.data)) {
            (global as any).planeData = jsonData.data;

            // Process and broadcast aircraft data with FLARM resolution
            await processAndBroadcastAircraftData(jsonData);
            return; // Don't double-broadcast
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

            // Broadcast ADSB data as-is (doesn't need FLARM resolution)
            broadcastDataToSubscribedPlaneTrackers(jsonData);
            return; // Don't double-broadcast
          } else if (jsonData.type === 'aircraft_update' && jsonData.data) {
            const aircraftId = jsonData.data.id;
            const existingIndex = (global as any).planeData.findIndex((a: any) => a.id === aircraftId);
            if (existingIndex >= 0) {
              (global as any).planeData[existingIndex] = jsonData.data;
            } else {
              (global as any).planeData.push(jsonData.data);
            }

            // Process and broadcast single aircraft update with FLARM resolution
            await processAndBroadcastAircraftData(jsonData);
            return; // Don't double-broadcast
          } else if (jsonData.type === 'aircraft_batch_update' && Array.isArray(jsonData.data)) {
            // Update the global plane data
            jsonData.data.forEach((aircraft: any) => {
              const existingIndex = (global as any).planeData.findIndex((a: any) => a.id === aircraft.id);
              if (existingIndex >= 0) {
                (global as any).planeData[existingIndex] = aircraft;
              } else {
                (global as any).planeData.push(aircraft);
              }
            });

            // Process and broadcast batch update with FLARM resolution
            await processAndBroadcastAircraftData(jsonData);
            return; // Don't double-broadcast
          } else if (jsonData.type === 'adsb_aircraft_update' && jsonData.data) {
            const aircraftId = jsonData.data.aircraft_id || jsonData.data.id;
            const existingIndex = (global as any).planeData.findIndex((a: any) => a.id === aircraftId || a.aircraft_id === aircraftId);
            if (existingIndex >= 0) {
              (global as any).planeData[existingIndex] = jsonData.data;
            } else {
              (global as any).planeData.push(jsonData.data);
            }

            // Broadcast ADSB update as-is
            broadcastDataToSubscribedPlaneTrackers(jsonData);
            return; // Don't double-broadcast
          } else if (jsonData.type === 'aircraft_removed' && jsonData.data && jsonData.data.id) {
            const aircraftId = jsonData.data.id;
            (global as any).planeData = (global as any).planeData.filter((a: any) => a.id !== aircraftId);

            // Broadcast removal as-is
            broadcastDataToSubscribedPlaneTrackers(jsonData);
            return; // Don't double-broadcast
          } else if (jsonData.type === 'adsb_aircraft_removed' && jsonData.data && (jsonData.data.id || jsonData.data.aircraft_id)) {
            const aircraftId = jsonData.data.aircraft_id || jsonData.data.id;
            (global as any).planeData = (global as any).planeData.filter((a: any) => a.id !== aircraftId && a.aircraft_id !== aircraftId);

            // Broadcast removal as-is
            broadcastDataToSubscribedPlaneTrackers(jsonData);
            return; // Don't double-broadcast
          } else if (jsonData.type === 'tracked_aircraft_update') {
            // Forward tracked aircraft updates to clients that have subscribed to aircraft tracking
            broadcastTrackedAircraftUpdate(jsonData);
            // Don't broadcast this to all plane-tracker subscribers
            return;
          } else if (jsonData.type === 'subscription_confirmed' || jsonData.type === 'unsubscription_confirmed') {
            // Forward subscription confirmations to the client
            broadcastTrackedAircraftUpdate(jsonData);
            return;
          } else {
            // For any other unhandled message types, broadcast as-is
            broadcastDataToSubscribedPlaneTrackers(jsonData);
          }
        } else {
          // Non-JSON data, broadcast as-is
          broadcastDataToSubscribedPlaneTrackers(data.toString());
        }
      } catch (e) {
        console.error('Error processing plane tracker message:', e);
        // On error, try to broadcast raw data as fallback
        broadcastDataToSubscribedPlaneTrackers(data.toString());
      }
    });

    socket.on('close', (code, reason) => {
      if (DEBUG_WEBSOCKET) console.log(`🔌 Plane tracker WebSocket closed with code ${code}, reason: ${reason}`);
      (global as any).planeTrackerSocket = null;

      // Clear the data request interval
      if ((global as any).planeTrackerDataInterval) {
        clearInterval((global as any).planeTrackerDataInterval);
        (global as any).planeTrackerDataInterval = null;
      }

      if (countClientsSubscribedToTopic('plane-tracker') > 0) {
        if (DEBUG_WEBSOCKET) console.log('🔄 Reconnecting to plane tracker in 5 seconds...');
        (global as any).planeTrackerConnectTimer = setTimeout(connectToPlaneTracker, 5000);
      }
    });

    socket.on('error', (error) => {
      console.error('🔴 Plane tracker WebSocket error:', error);
      socket.close();
    });

  } catch (error) {
    console.error('🔴 Failed to connect to plane tracker:', error);
    if (countClientsSubscribedToTopic('plane-tracker') > 0) {
      (global as any).planeTrackerConnectTimer = setTimeout(connectToPlaneTracker, 5000);
    }
  }
}

function disconnectFromPlaneTracker() {
  if (!(global as any).planeTrackerSocket) return;

  try {
    const socket = (global as any).planeTrackerSocket;

    // Only try to close if the socket is in a valid state
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
      socket.close();
    }

    (global as any).planeTrackerSocket = null;
  } catch (error) {
    console.error('Error disconnecting from plane tracker:', error);
    // Ensure we still clear the reference even if close() fails
    (global as any).planeTrackerSocket = null;
  }


  if ((global as any).planeTrackerConnectTimer) {
    clearTimeout((global as any).planeTrackerConnectTimer);
    (global as any).planeTrackerConnectTimer = null;
  }
}

function manageTrackerConnection() {
  const planeTrackerSubscribersCount = countClientsSubscribedToTopic('plane-tracker');
  const trackedAircraftSubscribersCount = countClientsSubscribedToTopic('tracked_aircraft');
  const totalSubscribers = planeTrackerSubscribersCount + trackedAircraftSubscribersCount;

  if (DEBUG_WEBSOCKET) console.log(`🔍 Managing tracker connection: ${totalSubscribers} total subscribers`);

  if (totalSubscribers > 0) {
    const socket = (global as any).planeTrackerSocket;

    if (!socket) {
      if (DEBUG_WEBSOCKET) console.log('🚀 No socket exists, connecting to plane tracker...');
      connectToPlaneTracker();
    } else if (socket.readyState === WebSocket.CONNECTING) {
      if (DEBUG_WEBSOCKET) console.log('⏳ Socket is already connecting, waiting...');
      // Don't interrupt a connecting socket
    } else if (socket.readyState === WebSocket.OPEN) {
      if (DEBUG_WEBSOCKET) console.log('✅ Socket is already open and ready');
    } else {
      if (DEBUG_WEBSOCKET) console.log('🔄 Socket is in invalid state, reconnecting...');
      connectToPlaneTracker();
    }
  } else {
    if (DEBUG_WEBSOCKET) console.log('🛑 No subscribers, disconnecting from plane tracker...');
    disconnectFromPlaneTracker();
  }
}

function broadcastDataToSubscribedPlaneTrackers(message: string | object) {
  const messageString = typeof message === 'string' ? message : JSON.stringify(message);

  if (!(global as any).wsClients?.size) {
    if (DEBUG_WEBSOCKET) console.log('📡 No WebSocket clients connected, skipping broadcast');
    return;
  }

  // Parse the message to see what type of data we're broadcasting
  if (DEBUG_WEBSOCKET) {
    try {
      const parsedMessage = JSON.parse(messageString);
      if (parsedMessage.type) {
        console.log(`📡 Broadcasting ${parsedMessage.type} to plane tracker subscribers`);
      }
    } catch (e) {
      // Message is not JSON, just log that we're broadcasting
      console.log('📡 Broadcasting non-JSON data to plane tracker subscribers');
    }
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
      (global as any).wsClients.delete(client);
    }
  });

  if (clientsToRemove.length > 0) {
    manageTrackerConnection();
  }

  if (DEBUG_WEBSOCKET) {
    console.log(`📡 Broadcast complete: ${activeClientCount} clients received data, ${failedClientCount} failed, ${clientsToRemove.length} removed`);
  }

  if (activeClientCount > 0) {
    // Data successfully sent to clients
  }
}

function broadcastTrackedAircraftUpdate(message: any) {
  const messageString = JSON.stringify(message);

  if (!(global as any).wsClients?.size) {
    return;
  }

  let activeClientCount = 0;
  let failedClientCount = 0;
  const clientsToRemove: WebSocket[] = [];

  (global as any).wsClients.forEach((clientInfo: ClientInfo, client: WebSocket) => {
    if (clientInfo.isAuthenticated && clientInfo.subscribedTopics.has('tracked_aircraft')) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(messageString);
          activeClientCount++;
        } catch (error) {
          console.error('Error sending tracked aircraft data to client:', error);
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
      (global as any).wsClients.delete(client);
    }
  });

  if (activeClientCount > 0) {
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
//       global.wsClients.delete(client);
//     }
//   });
//
//   if (activeClientCount > 0) {
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
    }
    
    
    const clientInfo: ClientInfo = {
      isAuthenticated: false,
      mainChannel: null,
      subscribedTopics: new Set(),
      clientId: clientId,
      clubId: undefined,
    };
    (global as any).wsClients?.set(client, clientInfo);
    
    let authenticatedViaCookie = false;
    const cookieHeader = request.headers.cookie;
    if (cookieHeader) {
      const cookies = parse(cookieHeader);
      const accessTokenCookieName = process.env.TABLET_ACCESS_TOKEN_COOKIE_NAME || 'tablet-access-token';
      const token = cookies[accessTokenCookieName];

      if (token) {
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
      }
    } else {
    }

    setTimeout(() => {
      if (!clientInfo.isAuthenticated && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: 'auth_required', message: 'Authentication via cookie failed or not attempted. Please ensure you are logged in.' }));
      }
    }, 1000);
    
    client.on("close", (code, reason) => {
      const currentClientInfo = (global as any).wsClients?.get(client);
      if (currentClientInfo) {
        (global as any).wsClients?.delete(client);
      } else {
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
          const status = await checkFlarmStatus(data.flarmId);
          sendFlarmStatusToClient(client, data.flarmId, status);
          return;
        }
        
        if (data.type === 'flarm_status_batch_request' && Array.isArray(data.flarmIds)) {
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

          if (data.channel === 'plane-tracker') {
            currentClientInfo.subscribedTopics.add('plane-tracker');
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
             client.send(JSON.stringify({
              type: 'subscription_nak',
              topic: data.channel,
              status: 'topic_not_available'
            }));
          }
          return;
        }

        // Handle aircraft tracking subscription
        if (data.type === 'subscribe_aircraft' && data.aircraft_ids) {
          // Track which aircraft this client is subscribed to
          if (!currentClientInfo.subscribedTopics.has('tracked_aircraft')) {
            currentClientInfo.subscribedTopics.add('tracked_aircraft');
          }

          // Store the aircraft subscription for this client
          currentClientInfo.subscribedAircraft = data.aircraft_ids;

          // Ensure plane tracker connection is active
          manageTrackerConnection();

          // Forward the subscription to the plane tracker
          if ((global as any).planeTrackerSocket && (global as any).planeTrackerSocket.readyState === WebSocket.OPEN) {
            const subscriptionMessage = JSON.stringify({
              type: 'subscribe_aircraft',
              aircraft_ids: data.aircraft_ids
            });
            (global as any).planeTrackerSocket.send(subscriptionMessage);
          }

          return;
        }

        // Handle aircraft tracking unsubscription
        if (data.type === 'unsubscribe_aircraft' && data.aircraft_ids) {
          // Forward the unsubscription to the plane tracker
          if ((global as any).planeTrackerSocket && (global as any).planeTrackerSocket.readyState === WebSocket.OPEN) {
            (global as any).planeTrackerSocket.send(JSON.stringify({
              type: 'unsubscribe_aircraft',
              aircraft_ids: data.aircraft_ids
            }));
          }

          return;
        }

        // Handle ADSB preference setting
        if (data.type === 'set_adsb_preference' && typeof data.wants_adsb === 'boolean') {
          // Forward the ADSB preference to the plane tracker
          if ((global as any).planeTrackerSocket && (global as any).planeTrackerSocket.readyState === WebSocket.OPEN) {
            (global as any).planeTrackerSocket.send(JSON.stringify({
              type: 'client_wants_adsb',
              wants_adsb: data.wants_adsb
            }));
          }

          return;
        }

        if (data.type === 'unsubscribe' && data.channel) {
           
          if (data.channel === 'plane-tracker') {
            currentClientInfo.subscribedTopics.delete('plane-tracker');


            client.send(JSON.stringify({
              type: 'subscription_ack',
              topic: 'plane-tracker',
              status: 'unsubscribed'
            }));
            manageTrackerConnection();
          } else {
            client.send(JSON.stringify({ 
              type: 'subscription_nak',
              topic: data.channel, 
              status: 'topic_not_available' 
            }));
          }
          return;
        }
        
        if (data.type === 'disconnect') {
          client.send(JSON.stringify({ type: 'disconnect_ack' }));
          client.close(); 
          return;
        }
        
        
        if (data.type === 'echo') {
          client.send(msgStr);
        } else {
          console.warn(`Unhandled message type '${data.type}' from ${currentClientInfo.clientId}`);
          client.send(JSON.stringify({ type: 'error', message: `Unhandled message type: ${data.type}`}));
        }
      } catch (e) {
        const clientDetail = currentClientInfo ? `Client ${currentClientInfo.clientId} (Channel: ${currentClientInfo.mainChannel})` : `Client ${clientId}`;
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