import { SignJWT, jwtVerify, JWTPayload as JoseJWTPayload } from 'jose'

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-this-in-production'
const secret = new TextEncoder().encode(JWT_SECRET)

// This interface is used for both regular user JWTs and tablet JWTs.
// Make fields optional if they are not present in all token types.
interface ClubMembershipForToken { // Renamed to avoid conflict if ClubMembership type exists elsewhere
  clubId: string
  clubName: string
  role: 'ADMIN' | 'USER' // Or other roles you might have
}

// Admin context for audit logging and authorization
interface AdminContext {
  clubId: string;
  clubName: string;
  pilotId: string;
  pilotName: string;
  sessionType: 'club_admin';
}

export interface JWTPayload extends JoseJWTPayload {
  // Common fields for all JWTs
  id: string; // For users: pilotId, For tablets: clubId

  // Fields primarily for user JWTs (make optional if not in tablet JWTs)
  email?: string;
  is_admin?: boolean;
  clubs?: ClubMembershipForToken[];

  // Fields primarily for tablet JWTs (make optional if not in user JWTs)
  clubId?: string; // Can be redundant if `id` is always clubId for tablets
  homefield?: string | null;
  
  // Admin context for club admin sessions
  adminContext?: AdminContext;
  // You could also add a 'token_type': 'user' | 'tablet' | 'admin' field if needed for differentiation
}

export async function generateTokens(payload: JWTPayload) {
  const isTabletToken = !!payload.homefield;
  
  const accessTokenExpiration = isTabletToken ? '7d' : '15m'; // 7 days for tablet, 15 minutes for user
  const refreshTokenExpiration = isTabletToken ? '30d' : '7d'; // 30 days for tablet, 7 days for user

  const accessToken = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(accessTokenExpiration)
    .sign(secret)

  const refreshToken = await new SignJWT(payload) 
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(refreshTokenExpiration)
    .sign(secret)

  // Convert expiration times to seconds for cookie maxAge
  const parseExpiration = (timeStr: string): number => {
    const unit = timeStr.slice(-1);
    const value = parseInt(timeStr.slice(0, -1), 10);
    if (unit === 'm') return value * 60;
    if (unit === 'h') return value * 60 * 60;
    if (unit === 'd') return value * 24 * 60 * 60;
    return value; // Assuming seconds if no unit or unknown unit
  };

  const accessTokenExpiresIn = parseExpiration(accessTokenExpiration);
  const refreshTokenExpiresIn = parseExpiration(refreshTokenExpiration);

  return { accessToken, refreshToken, accessTokenExpiresIn, refreshTokenExpiresIn }
}

export async function verifyToken(token: string): Promise<JWTPayload> {
  try {
    const { payload } = await jwtVerify(token, secret)
    return payload as unknown as JWTPayload
  } catch (error) {
    console.error('JWT verification error:', error)
    throw error
  }
} 