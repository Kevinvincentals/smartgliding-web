import { NextResponse } from 'next/server';
import { z } from 'zod';
import { broadcastToClients } from '@/lib/websocket/utils';

// Define schema for aircraft in the incursion
const aircraftSchema = z.object({
  flarm_id: z.string(),
  registration: z.string(),
});

// Define schema for webhook payloads
const incursionSchema = z.object({
  type: z.enum(['landing_incursion', 'clear_incursion']),
  airfield: z.string(),
  aircraft: z.array(aircraftSchema),
  severity: z.enum(['low', 'medium', 'high']).optional(),
  timestamp: z.string().optional(),
});

type WebhookPayload = z.infer<typeof incursionSchema>;

export async function POST(request: Request) {
  try {
    // Parse webhook payload
    const payload = await request.json();
    
    // Validate the payload against our schema
    const validationResult = incursionSchema.safeParse(payload);
    
    if (!validationResult.success) {
      console.error('TCAS webhook validation error:', validationResult.error);
      return NextResponse.json({ 
        success: false, 
        error: 'Invalid payload format',
        details: validationResult.error.format()
      }, { status: 400 });
    }
    
    const validPayload = validationResult.data;
    
    // Add timestamp if not provided
    if (!validPayload.timestamp) {
      validPayload.timestamp = new Date().toISOString();
    }
    
    // Process the webhook based on type
    if (validPayload.type === 'landing_incursion') {
      // Broadcast the incursion event to WebSocket clients
      broadcastToClients({
        type: 'tcas_alert',
        event: 'landing_incursion',
        data: validPayload
      }, validPayload.airfield);
      
      return NextResponse.json({
        success: true,
        message: 'Landing incursion alert processed successfully',
        data: validPayload
      });
    } 
    else if (validPayload.type === 'clear_incursion') {
      // Broadcast the clear event to WebSocket clients
      broadcastToClients({
        type: 'tcas_alert',
        event: 'clear_incursion',
        data: validPayload
      }, validPayload.airfield);
      
      return NextResponse.json({
        success: true,
        message: 'Incursion cleared successfully',
        data: validPayload
      });
    }
    
    return NextResponse.json({ 
      success: false, 
      error: 'Unsupported webhook type' 
    }, { status: 400 });
  } catch (error) {
    console.error('TCAS webhook processing error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 });
  }
} 