import { NextResponse } from 'next/server';
import { downloadGliderDatabase, parseGliderDatabase } from '@/lib/flightLogbook';

export async function GET() {
  try {
    // Download the latest glider database
    const success = await downloadGliderDatabase();
    
    if (!success) {
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to download glider database' 
      }, { status: 500 });
    }
    
    // Parse the database to check if it's valid
    const gliders = await parseGliderDatabase();
    
    return NextResponse.json({
      success: true,
      message: 'Glider database synced successfully',
      count: gliders.length
    });
  } catch (error) {
    console.error('Error syncing glider database:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 });
  }
} 