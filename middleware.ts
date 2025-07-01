import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { JWTPayload } from '@/lib/jwt'

// Original public routes (likely for Bearer token auth, non-tablet APIs)
const generalAuthPublicRoutes = [
  '/api/auth/signin',
  '/api/auth/signup',
  '/api/auth/refresh_token',
  '/api/auth/verify', 
]

// Tablet specific public auth routes (bypass tablet cookie check in middleware)
const tabletAuthPublicRoutes = [
  '/api/tablet/auth/signin',
  '/api/tablet/auth/signout',
  '/api/tablet/auth/refresh',
]

// Admin specific public auth routes (bypass admin cookie check in middleware)
const adminAuthPublicRoutes = [
  '/api/club/admin/auth/signout',
  '/api/club/admin/auth/refresh',
]

// Admin routes that need tablet authentication (not admin authentication)
const adminRoutesNeedingTabletAuth = [
  '/api/club/admin/auth/get-admins',
  '/api/club/admin/auth/signin',
]

const JWT_SECRET_STRING = process.env.JWT_SECRET || 'your-super-secret-key-change-this-in-production'
const joseSecretKey = new TextEncoder().encode(JWT_SECRET_STRING)
const TABLET_ACCESS_COOKIE_NAME = process.env.TABLET_ACCESS_TOKEN_COOKIE_NAME || 'tablet-access-token'
const TABLET_REFRESH_COOKIE_NAME = process.env.TABLET_REFRESH_TOKEN_COOKIE_NAME || 'tablet-refresh-token'
const ADMIN_ACCESS_COOKIE_NAME = 'admin-access-token'
const ADMIN_REFRESH_COOKIE_NAME = 'admin-refresh-token'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip middleware for non-API routes or preflight OPTIONS requests
  if (!pathname.startsWith('/api') || request.method === 'OPTIONS') {
    return NextResponse.next()
  }

  // Handle /api/tablet/* and /api/reports/* routes and admin routes needing tablet auth (Cookie-based authentication)
  if (pathname.startsWith('/api/tablet/') || pathname.startsWith('/api/reports/') || adminRoutesNeedingTabletAuth.some(path => pathname.startsWith(path))) {
    // If it's a report route, it's protected by tablet auth. 
    // If it's a tablet route, check against public tablet auth routes.
    if (pathname.startsWith('/api/tablet/') && tabletAuthPublicRoutes.some(path => pathname.startsWith(path))) {
      return NextResponse.next() // Allow public tablet auth routes
    }
    // Add a similar check here if you ever have public /api/reports/auth/* routes

    let tokenCookie = request.cookies.get(TABLET_ACCESS_COOKIE_NAME)
    let newCookiesFromRefresh: string[] = [];

    if (!tokenCookie?.value) {
      console.log(`Middleware (Tablet): Cookie '${TABLET_ACCESS_COOKIE_NAME}' not found for ${pathname}. Attempting refresh.`);
      // Access token missing, try to refresh
      const refreshTokenCookie = request.cookies.get(TABLET_REFRESH_COOKIE_NAME);
      if (refreshTokenCookie?.value) {
        const refreshUrl = new URL('/api/tablet/auth/refresh', request.url).toString();
        try {
          console.log(`Middleware (Tablet): Calling refresh token endpoint for ${pathname}`);
          const refreshResponse = await fetch(refreshUrl, {
            method: 'POST',
            headers: {
              // Ensure the refresh token cookie is sent correctly
              'Cookie': `${TABLET_REFRESH_COOKIE_NAME}=${refreshTokenCookie.value}`
            }
          });

          if (refreshResponse.ok) {
            const refreshedData = await refreshResponse.json(); // Expecting { success: true } or similar
            if (refreshedData.success) {
              console.log(`Middleware (Tablet): Token refresh successful for ${pathname}.`);
              // Capture Set-Cookie headers from the refresh response
              const setCookieHeader = refreshResponse.headers.getSetCookie();
              if (setCookieHeader.length > 0) {
                newCookiesFromRefresh = setCookieHeader;
                // Try to find the new access token from the Set-Cookie headers
                const newAccessTokenCookieString = newCookiesFromRefresh.find(cookie => cookie.startsWith(`${TABLET_ACCESS_COOKIE_NAME}=`));
                if (newAccessTokenCookieString) {
                  const newAccessTokenValue = newAccessTokenCookieString.split(';')[0].split('=')[1];
                  tokenCookie = { name: TABLET_ACCESS_COOKIE_NAME, value: newAccessTokenValue }; // Use the new token for verification
                  console.log(`Middleware (Tablet): New access token obtained via refresh for ${pathname}.`);
                } else {
                  console.warn(`Middleware (Tablet): Refresh successful but new access token cookie not found in Set-Cookie headers for ${pathname}.`);
                  tokenCookie = undefined; // Ensure it remains undefined
                }
              } else {
                 console.warn(`Middleware (Tablet): Refresh successful but no Set-Cookie headers found in refresh response for ${pathname}.`);
                 tokenCookie = undefined; // Ensure it remains undefined
              }
            } else {
              console.warn(`Middleware (Tablet): Refresh endpoint returned success:false for ${pathname}. Error: ${refreshedData.error}`);
              // Clear bad refresh token if refresh endpoint indicates it's invalid
              const response = new NextResponse(
                JSON.stringify({ success: false, error: refreshedData.error || 'Failed to refresh token.' }),
                { status: 401, headers: { 'Content-Type': 'application/json' } }
              );
              response.cookies.set(TABLET_ACCESS_COOKIE_NAME, '', { path: '/', expires: new Date(0) });
              response.cookies.set(TABLET_REFRESH_COOKIE_NAME, '', { path: '/', expires: new Date(0) });
              return response;
            }
          } else {
            const errorBody = await refreshResponse.text();
            console.warn(`Middleware (Tablet): Refresh token endpoint call failed for ${pathname}. Status: ${refreshResponse.status}. Body: ${errorBody}`);
             const response = new NextResponse(
                JSON.stringify({ success: false, error: 'Token refresh failed due to server error at refresh endpoint.' }),
                { status: 401, headers: { 'Content-Type': 'application/json' } }
              );
              response.cookies.set(TABLET_ACCESS_COOKIE_NAME, '', { path: '/', expires: new Date(0) });
              response.cookies.set(TABLET_REFRESH_COOKIE_NAME, '', { path: '/', expires: new Date(0) });
              return response;
          }
        } catch (e) {
          console.error(`Middleware (Tablet): Error during token refresh attempt for ${pathname}:`, e);
           const response = new NextResponse(
                JSON.stringify({ success: false, error: 'Internal error during token refresh attempt.' }),
                { status: 500, headers: { 'Content-Type': 'application/json' } }
            );
            return response; // Internal server error if fetch itself fails
        }
      } else {
        // No access token and no refresh token
        console.log(`Middleware (Tablet): No access or refresh token found for ${pathname}.`);
        return new NextResponse(
            JSON.stringify({ success: false, error: 'Authentication required: Missing tablet access and refresh tokens.' }),
            { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // Proceed to verify the token (either original or newly refreshed)
    if (!tokenCookie?.value) {
      // This case should ideally be caught by previous checks if refresh failed or wasn't possible
      console.log(`Middleware (Tablet): Final check - still no valid access token for ${pathname} after refresh attempt.`);
      const response = new NextResponse(
          JSON.stringify({ success: false, error: 'Authentication required: No valid tablet token after refresh attempt.' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
      // Clear cookies if refresh was attempted and failed to produce a new token or if original token was bad
      if (newCookiesFromRefresh.length === 0) { // Only clear if no new cookies were set (i.e. refresh didn't happen or failed early)
        response.cookies.set(TABLET_ACCESS_COOKIE_NAME, '', { path: '/', expires: new Date(0) });
        response.cookies.set(TABLET_REFRESH_COOKIE_NAME, '', { path: '/', expires: new Date(0) });
      }
      return response;
    }
    
    try {
      const { payload } = await jwtVerify(tokenCookie.value, joseSecretKey) as { payload: JWTPayload };
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set('x-jwt-payload', JSON.stringify(payload));
      
      const response = NextResponse.next({ request: { headers: requestHeaders } });
      // Apply any new cookies obtained from a successful refresh to the outgoing response
      newCookiesFromRefresh.forEach(cookieString => {
        // NextResponse.cookies.set() needs name, value, options. We parse from string.
        const parts = cookieString.split('; ');
        const [nameValue, ...optionsArray] = parts;
        const [name, ...valueParts] = nameValue.split('='); // name can contain '=' if value has it, but first is name
        const value = valueParts.join('=');

        const cookieOptions: any = {};
        optionsArray.forEach(option => {
            const [optName, ...optValueParts] = option.split('=');
            const optValue = optValueParts.join('=');
            if (optName.toLowerCase() === 'expires') cookieOptions.expires = new Date(optValue);
            else if (optName.toLowerCase() === 'max-age') cookieOptions.maxAge = parseInt(optValue, 10);
            else if (optName.toLowerCase() === 'path') cookieOptions.path = optValue;
            else if (optName.toLowerCase() === 'domain') cookieOptions.domain = optValue;
            else if (optName.toLowerCase() === 'secure') cookieOptions.secure = true;
            else if (optName.toLowerCase() === 'httponly') cookieOptions.httpOnly = true;
            else if (optName.toLowerCase() === 'samesite') cookieOptions.sameSite = optValue as ('strict' | 'lax' | 'none');
        });
        response.cookies.set(name, value, cookieOptions);
      });
      return response;

    } catch (error: any) {
      console.warn(`Middleware (Tablet): JWT cookie verification failed for ${pathname}. Error:`, error.message);
      let errMsg = 'Invalid tablet token.';
      let shouldAttemptRefresh = false;

      if (error.code === 'ERR_JWT_EXPIRED') {
        errMsg = 'Tablet token expired.';
        shouldAttemptRefresh = true;
      }

      if (shouldAttemptRefresh) {
        console.log(`Middleware (Tablet): Access token expired for ${pathname}. Attempting refresh.`);
        const refreshTokenCookie = request.cookies.get(TABLET_REFRESH_COOKIE_NAME);
        if (refreshTokenCookie?.value) {
          const refreshUrl = new URL('/api/tablet/auth/refresh', request.url).toString();
          try {
            console.log(`Middleware (Tablet): Calling refresh token endpoint due to expired access token for ${pathname}`);
            const refreshResponse = await fetch(refreshUrl, {
              method: 'POST',
              headers: { 'Cookie': `${TABLET_REFRESH_COOKIE_NAME}=${refreshTokenCookie.value}` }
            });

            if (refreshResponse.ok) {
               const refreshedData = await refreshResponse.json();
               if (refreshedData.success) {
                console.log(`Middleware (Tablet): Token refresh successful after expiry for ${pathname}.`);
                const setCookieHeader = refreshResponse.headers.getSetCookie();
                let newAccessTokenValue: string | undefined;

                if (setCookieHeader.length > 0) {
                  newCookiesFromRefresh = setCookieHeader; // Store for applying to final response
                  const newAccessTokenCookieString = newCookiesFromRefresh.find(cookie => cookie.startsWith(`${TABLET_ACCESS_COOKIE_NAME}=`));
                  if (newAccessTokenCookieString) {
                    newAccessTokenValue = newAccessTokenCookieString.split(';')[0].split('=')[1];
                  }
                }

                if (newAccessTokenValue) {
                  console.log(`Middleware (Tablet): New access token obtained via refresh after expiry for ${pathname}. Retrying verification.`);
                  // Verify the new token
                  const { payload: newPayload } = await jwtVerify(newAccessTokenValue, joseSecretKey) as { payload: JWTPayload };
                  const requestHeaders = new Headers(request.headers);
                  requestHeaders.set('x-jwt-payload', JSON.stringify(newPayload));
                  const response = NextResponse.next({ request: { headers: requestHeaders } });
                  // Apply new cookies from refresh
                  newCookiesFromRefresh.forEach(cookieString => {
                    const parts = cookieString.split('; ');
                    const [nameValue, ...optionsArray] = parts;
                    const [name, ...valueParts] = nameValue.split('=');
                    const value = valueParts.join('=');
                    const cookieOptions: any = {};
                    optionsArray.forEach(option => {
                        const [optName, ...optValueParts] = option.split('=');
                        const optValue = optValueParts.join('=');
                        if (optName.toLowerCase() === 'expires') cookieOptions.expires = new Date(optValue);
                        else if (optName.toLowerCase() === 'max-age') cookieOptions.maxAge = parseInt(optValue, 10);
                        // ... (include all other cookie options as above)
                        else if (optName.toLowerCase() === 'path') cookieOptions.path = optValue;
                        else if (optName.toLowerCase() === 'domain') cookieOptions.domain = optValue;
                        else if (optName.toLowerCase() === 'secure') cookieOptions.secure = true;
                        else if (optName.toLowerCase() === 'httponly') cookieOptions.httpOnly = true;
                        else if (optName.toLowerCase() === 'samesite') cookieOptions.sameSite = optValue as ('strict' | 'lax' | 'none');
                    });
                    response.cookies.set(name, value, cookieOptions);
                  });
                  return response;
                } else {
                   console.warn(`Middleware (Tablet): Refresh after expiry successful but new access token not found for ${pathname}.`);
                }
               } else {
                 console.warn(`Middleware (Tablet): Refresh endpoint returned success:false after expiry for ${pathname}. Error: ${refreshedData.error}`);
                 // Clear bad refresh token
                  const response = new NextResponse(
                    JSON.stringify({ success: false, error: refreshedData.error || 'Failed to refresh expired token.' }),
                    { status: 401, headers: { 'Content-Type': 'application/json' } }
                  );
                  response.cookies.set(TABLET_ACCESS_COOKIE_NAME, '', { path: '/', expires: new Date(0) });
                  response.cookies.set(TABLET_REFRESH_COOKIE_NAME, '', { path: '/', expires: new Date(0) });
                  return response;
               }
            } else {
              const errorBody = await refreshResponse.text();
              console.warn(`Middleware (Tablet): Refresh token endpoint call failed after expiry for ${pathname}. Status: ${refreshResponse.status}. Body: ${errorBody}`);
              // Clear cookies on failed refresh
              const response = new NextResponse(
                JSON.stringify({ success: false, error: 'Token refresh failed due to server error at refresh endpoint.' }),
                { status: 401, headers: { 'Content-Type': 'application/json' } }
              );
              response.cookies.set(TABLET_ACCESS_COOKIE_NAME, '', { path: '/', expires: new Date(0) });
              response.cookies.set(TABLET_REFRESH_COOKIE_NAME, '', { path: '/', expires: new Date(0) });
              return response;
            }
          } catch (e) {
            console.error(`Middleware (Tablet): Error during token refresh attempt after expiry for ${pathname}:`, e);
            const response = new NextResponse(
                JSON.stringify({ success: false, error: 'Internal error during token refresh post-expiry.' }),
                { status: 500, headers: { 'Content-Type': 'application/json' } }
            );
            return response;
          }
        } else {
          // Access token expired, but no refresh token to use
           console.log(`Middleware (Tablet): Access token expired, but no refresh token available for ${pathname}.`);
        }
      }
      
      // If refresh wasn't attempted or failed, and token is invalid/expired
      const response = new NextResponse(
        JSON.stringify({ success: false, error: `Authentication failed: ${errMsg}` }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
      // Clear cookies if error is JWT_EXPIRED or if the token was simply invalid (and refresh wasn't successful)
      response.cookies.set(TABLET_ACCESS_COOKIE_NAME, '', { path: '/', expires: new Date(0) });
      if (error.code === 'ERR_JWT_EXPIRED' || !shouldAttemptRefresh) { // Clear refresh token if access token expired (it might be compromised) or if token was just invalid
          response.cookies.set(TABLET_REFRESH_COOKIE_NAME, '', { path: '/', expires: new Date(0) });
      }
      return response;
    }
  }

  // Handle /api/club/admin/* routes (Admin Cookie-based authentication)
  if (pathname.startsWith('/api/club/admin/')) {
    // Check if it's a route that needs tablet auth (already handled above)
    if (adminRoutesNeedingTabletAuth.some(path => pathname.startsWith(path))) {
      // These routes were already handled by tablet auth section above
      return NextResponse.next()
    }
    
    // Check if it's a public admin auth route
    if (adminAuthPublicRoutes.some(path => pathname.startsWith(path))) {
      // For signin, signout, and refresh, allow without admin auth
      return NextResponse.next()
    }

    // For protected admin routes, check admin authentication with refresh capability
    let adminTokenCookie = request.cookies.get(ADMIN_ACCESS_COOKIE_NAME)
    let newCookiesFromRefresh: string[] = []

    if (!adminTokenCookie?.value) {
      console.log(`Middleware (Admin): Cookie '${ADMIN_ACCESS_COOKIE_NAME}' not found for ${pathname}. Attempting refresh.`)
      // Access token missing, try to refresh
      const refreshTokenCookie = request.cookies.get(ADMIN_REFRESH_COOKIE_NAME)
      if (refreshTokenCookie?.value) {
        const refreshUrl = new URL('/api/club/admin/auth/refresh', request.url).toString()
        try {
          console.log(`Middleware (Admin): Calling refresh token endpoint for ${pathname}`)
          const refreshResponse = await fetch(refreshUrl, {
            method: 'POST',
            headers: {
              'Cookie': `${ADMIN_REFRESH_COOKIE_NAME}=${refreshTokenCookie.value}`
            }
          })

          if (refreshResponse.ok) {
            const refreshedData = await refreshResponse.json()
            if (refreshedData.success) {
              console.log(`Middleware (Admin): Token refresh successful for ${pathname}.`)
              // Capture Set-Cookie headers from the refresh response
              const setCookieHeader = refreshResponse.headers.getSetCookie()
              if (setCookieHeader.length > 0) {
                newCookiesFromRefresh = setCookieHeader
                // Try to find the new access token from the Set-Cookie headers
                const newAccessTokenCookieString = newCookiesFromRefresh.find(cookie => cookie.startsWith(`${ADMIN_ACCESS_COOKIE_NAME}=`))
                if (newAccessTokenCookieString) {
                  const newAccessTokenValue = newAccessTokenCookieString.split(';')[0].split('=')[1]
                  adminTokenCookie = { name: ADMIN_ACCESS_COOKIE_NAME, value: newAccessTokenValue }
                  console.log(`Middleware (Admin): New access token obtained via refresh for ${pathname}.`)
                } else {
                  console.warn(`Middleware (Admin): Refresh successful but new access token cookie not found in Set-Cookie headers for ${pathname}.`)
                  adminTokenCookie = undefined
                }
              } else {
                console.warn(`Middleware (Admin): Refresh successful but no Set-Cookie headers found in refresh response for ${pathname}.`)
                adminTokenCookie = undefined
              }
            } else {
              console.warn(`Middleware (Admin): Refresh endpoint returned success:false for ${pathname}. Error: ${refreshedData.error}`)
              // Clear bad refresh token if refresh endpoint indicates it's invalid
              const response = new NextResponse(
                JSON.stringify({ success: false, error: refreshedData.error || 'Failed to refresh admin token.' }),
                { status: 401, headers: { 'Content-Type': 'application/json' } }
              )
              response.cookies.set(ADMIN_ACCESS_COOKIE_NAME, '', { path: '/', expires: new Date(0) })
              response.cookies.set(ADMIN_REFRESH_COOKIE_NAME, '', { path: '/', expires: new Date(0) })
              return response
            }
          } else {
            const errorBody = await refreshResponse.text()
            console.warn(`Middleware (Admin): Refresh token endpoint call failed for ${pathname}. Status: ${refreshResponse.status}. Body: ${errorBody}`)
            const response = new NextResponse(
              JSON.stringify({ success: false, error: 'Admin token refresh failed due to server error at refresh endpoint.' }),
              { status: 401, headers: { 'Content-Type': 'application/json' } }
            )
            response.cookies.set(ADMIN_ACCESS_COOKIE_NAME, '', { path: '/', expires: new Date(0) })
            response.cookies.set(ADMIN_REFRESH_COOKIE_NAME, '', { path: '/', expires: new Date(0) })
            return response
          }
        } catch (e) {
          console.error(`Middleware (Admin): Error during token refresh attempt for ${pathname}:`, e)
          const response = new NextResponse(
            JSON.stringify({ success: false, error: 'Internal error during admin token refresh attempt.' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
          )
          return response
        }
      } else {
        // No access token and no refresh token
        console.log(`Middleware (Admin): No access or refresh token found for ${pathname}.`)
        return new NextResponse(
          JSON.stringify({ success: false, error: 'Admin authentication required: Missing admin access and refresh tokens.' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        )
      }
    }

    // Proceed to verify the token (either original or newly refreshed)
    if (!adminTokenCookie?.value) {
      console.log(`Middleware (Admin): Final check - still no valid access token for ${pathname} after refresh attempt.`)
      const response = new NextResponse(
        JSON.stringify({ success: false, error: 'Admin authentication required: No valid admin token after refresh attempt.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
      if (newCookiesFromRefresh.length === 0) {
        response.cookies.set(ADMIN_ACCESS_COOKIE_NAME, '', { path: '/', expires: new Date(0) })
        response.cookies.set(ADMIN_REFRESH_COOKIE_NAME, '', { path: '/', expires: new Date(0) })
      }
      return response
    }

    try {
      const { payload } = await jwtVerify(adminTokenCookie.value, joseSecretKey) as { payload: JWTPayload }
      
      // Verify this is an admin token with proper admin context
      if (!payload.adminContext || payload.adminContext.sessionType !== 'club_admin') {
        return NextResponse.json(
          { error: 'Invalid admin session' },
          { status: 403 }
        )
      }

      const requestHeaders = new Headers(request.headers)
      requestHeaders.set('x-admin-jwt-payload', JSON.stringify(payload))
      
      const response = NextResponse.next({ request: { headers: requestHeaders } })
      // Apply any new cookies obtained from a successful refresh to the outgoing response
      newCookiesFromRefresh.forEach(cookieString => {
        const parts = cookieString.split('; ')
        const [nameValue, ...optionsArray] = parts
        const [name, ...valueParts] = nameValue.split('=')
        const value = valueParts.join('=')

        const cookieOptions: any = {}
        optionsArray.forEach(option => {
          const [optName, ...optValueParts] = option.split('=')
          const optValue = optValueParts.join('=')
          if (optName.toLowerCase() === 'expires') cookieOptions.expires = new Date(optValue)
          else if (optName.toLowerCase() === 'max-age') cookieOptions.maxAge = parseInt(optValue, 10)
          else if (optName.toLowerCase() === 'path') cookieOptions.path = optValue
          else if (optName.toLowerCase() === 'domain') cookieOptions.domain = optValue
          else if (optName.toLowerCase() === 'secure') cookieOptions.secure = true
          else if (optName.toLowerCase() === 'httponly') cookieOptions.httpOnly = true
          else if (optName.toLowerCase() === 'samesite') cookieOptions.sameSite = optValue as ('strict' | 'lax' | 'none')
        })
        response.cookies.set(name, value, cookieOptions)
      })
      return response

    } catch (error: any) {
      console.warn(`Middleware (Admin): JWT cookie verification failed for ${pathname}. Error:`, error.message)
      let errMsg = 'Invalid admin token.'
      let shouldAttemptRefresh = false

      if (error.code === 'ERR_JWT_EXPIRED') {
        errMsg = 'Admin token expired.'
        shouldAttemptRefresh = true
      }

      if (shouldAttemptRefresh) {
        console.log(`Middleware (Admin): Access token expired for ${pathname}. Attempting refresh.`)
        const refreshTokenCookie = request.cookies.get(ADMIN_REFRESH_COOKIE_NAME)
        if (refreshTokenCookie?.value) {
          const refreshUrl = new URL('/api/club/admin/auth/refresh', request.url).toString()
          try {
            console.log(`Middleware (Admin): Calling refresh token endpoint due to expired access token for ${pathname}`)
            const refreshResponse = await fetch(refreshUrl, {
              method: 'POST',
              headers: { 'Cookie': `${ADMIN_REFRESH_COOKIE_NAME}=${refreshTokenCookie.value}` }
            })

            if (refreshResponse.ok) {
              const refreshedData = await refreshResponse.json()
              if (refreshedData.success) {
                console.log(`Middleware (Admin): Token refresh successful after expiry for ${pathname}.`)
                const setCookieHeader = refreshResponse.headers.getSetCookie()
                let newAccessTokenValue: string | undefined

                if (setCookieHeader.length > 0) {
                  newCookiesFromRefresh = setCookieHeader
                  const newAccessTokenCookieString = newCookiesFromRefresh.find(cookie => cookie.startsWith(`${ADMIN_ACCESS_COOKIE_NAME}=`))
                  if (newAccessTokenCookieString) {
                    newAccessTokenValue = newAccessTokenCookieString.split(';')[0].split('=')[1]
                  }
                }

                if (newAccessTokenValue) {
                  console.log(`Middleware (Admin): New access token obtained via refresh after expiry for ${pathname}. Retrying verification.`)
                  // Verify the new token
                  const { payload: newPayload } = await jwtVerify(newAccessTokenValue, joseSecretKey) as { payload: JWTPayload }
                  
                  // Verify this is an admin token with proper admin context
                  if (!newPayload.adminContext || newPayload.adminContext.sessionType !== 'club_admin') {
                    return NextResponse.json(
                      { error: 'Invalid admin session after refresh' },
                      { status: 403 }
                    )
                  }

                  const requestHeaders = new Headers(request.headers)
                  requestHeaders.set('x-admin-jwt-payload', JSON.stringify(newPayload))
                  const response = NextResponse.next({ request: { headers: requestHeaders } })
                  // Apply new cookies from refresh
                  newCookiesFromRefresh.forEach(cookieString => {
                    const parts = cookieString.split('; ')
                    const [nameValue, ...optionsArray] = parts
                    const [name, ...valueParts] = nameValue.split('=')
                    const value = valueParts.join('=')
                    const cookieOptions: any = {}
                    optionsArray.forEach(option => {
                      const [optName, ...optValueParts] = option.split('=')
                      const optValue = optValueParts.join('=')
                      if (optName.toLowerCase() === 'expires') cookieOptions.expires = new Date(optValue)
                      else if (optName.toLowerCase() === 'max-age') cookieOptions.maxAge = parseInt(optValue, 10)
                      else if (optName.toLowerCase() === 'path') cookieOptions.path = optValue
                      else if (optName.toLowerCase() === 'domain') cookieOptions.domain = optValue
                      else if (optName.toLowerCase() === 'secure') cookieOptions.secure = true
                      else if (optName.toLowerCase() === 'httponly') cookieOptions.httpOnly = true
                      else if (optName.toLowerCase() === 'samesite') cookieOptions.sameSite = optValue as ('strict' | 'lax' | 'none')
                    })
                    response.cookies.set(name, value, cookieOptions)
                  })
                  return response
                } else {
                  console.warn(`Middleware (Admin): Refresh after expiry successful but new access token not found for ${pathname}.`)
                }
              } else {
                console.warn(`Middleware (Admin): Refresh endpoint returned success:false after expiry for ${pathname}. Error: ${refreshedData.error}`)
                // Clear bad refresh token
                const response = new NextResponse(
                  JSON.stringify({ success: false, error: refreshedData.error || 'Failed to refresh expired admin token.' }),
                  { status: 401, headers: { 'Content-Type': 'application/json' } }
                )
                response.cookies.set(ADMIN_ACCESS_COOKIE_NAME, '', { path: '/', expires: new Date(0) })
                response.cookies.set(ADMIN_REFRESH_COOKIE_NAME, '', { path: '/', expires: new Date(0) })
                return response
              }
            } else {
              const errorBody = await refreshResponse.text()
              console.warn(`Middleware (Admin): Refresh token endpoint call failed after expiry for ${pathname}. Status: ${refreshResponse.status}. Body: ${errorBody}`)
              // Clear cookies on failed refresh
              const response = new NextResponse(
                JSON.stringify({ success: false, error: 'Admin token refresh failed due to server error at refresh endpoint.' }),
                { status: 401, headers: { 'Content-Type': 'application/json' } }
              )
              response.cookies.set(ADMIN_ACCESS_COOKIE_NAME, '', { path: '/', expires: new Date(0) })
              response.cookies.set(ADMIN_REFRESH_COOKIE_NAME, '', { path: '/', expires: new Date(0) })
              return response
            }
          } catch (e) {
            console.error(`Middleware (Admin): Error during token refresh attempt after expiry for ${pathname}:`, e)
            const response = new NextResponse(
              JSON.stringify({ success: false, error: 'Internal error during admin token refresh post-expiry.' }),
              { status: 500, headers: { 'Content-Type': 'application/json' } }
            )
            return response
          }
        } else {
          // Access token expired, but no refresh token to use
          console.log(`Middleware (Admin): Access token expired, but no refresh token available for ${pathname}.`)
        }
      }
      
      // If refresh wasn't attempted or failed, and token is invalid/expired
      const response = new NextResponse(
        JSON.stringify({ success: false, error: `Admin authentication failed: ${errMsg}` }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
      // Clear cookies if error is JWT_EXPIRED or if the token was simply invalid (and refresh wasn't successful)
      response.cookies.set(ADMIN_ACCESS_COOKIE_NAME, '', { path: '/', expires: new Date(0) })
      if (error.code === 'ERR_JWT_EXPIRED' || !shouldAttemptRefresh) {
        response.cookies.set(ADMIN_REFRESH_COOKIE_NAME, '', { path: '/', expires: new Date(0) })
      }
      return response
    }
  }

  // If not an /api/tablet/ or /api/club/admin/ route, fall through to existing/other API auth logic (Bearer token based)
  // This combines the original publicRoutes logic, excluding the tablet and admin ones already handled.
  const combinedPublicRoutes = [...generalAuthPublicRoutes, ...tabletAuthPublicRoutes, ...adminAuthPublicRoutes]
  if (combinedPublicRoutes.includes(pathname)) {
    // This check is now a bit redundant for tablet auth routes but harmless.
    // Ensures other public routes like /api/auth/verify are still public.
    return NextResponse.next()
  }

  // Existing Bearer token logic for other API routes (e.g., /api/admin, /api/club, /api/me)
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'Missing or invalid authorization header' },
      { status: 401 }
    )
  }
  const token = authHeader.split(' ')[1]
  
  const isAdminRoute = pathname.startsWith('/api/admin/')
  const isClubAdminRoute = pathname.startsWith('/api/club/admin/')

  const url = new URL(request.url)
  const clubIdParam = url.searchParams.get('clubId')
  const planeIdParam = url.searchParams.get('planeId')

  let bodyClubId, bodyPlaneId
  if (!clubIdParam && !planeIdParam && ['POST', 'PUT', 'DELETE'].includes(request.method)) {
    try {
      const clonedRequest = request.clone()
      const body = await clonedRequest.json()
      bodyClubId = body.clubId
      bodyPlaneId = body.planeId
    } catch (error) {
      console.error('Failed to parse request body for Bearer auth path:', error)
    }
  }

  const verifyEndpoint = new URL('/api/auth/verify', request.url).toString()
  
  try {
    const verifyResponse = await fetch(verifyEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token, // Bearer token
        clubId: clubIdParam || bodyClubId,
        planeId: planeIdParam || bodyPlaneId,
        isAdminRoute,
        isClubAdminRoute
      })
    })

    const verifyData = await verifyResponse.json()

    if (!verifyData.isValid) {
      return NextResponse.json(
        { error: verifyData.error },
        { status: verifyResponse.status }
      )
    }

    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-user-id', verifyData.userId)
    if (verifyData.isAdmin) {
      requestHeaders.set('x-user-is-admin', 'true')
    }

    return NextResponse.next({ request: { headers: requestHeaders } })
  } catch (error) {
    console.error('Bearer Auth - Verification API error:', error)
    return NextResponse.json(
      { error: 'Authentication error via Bearer token flow' },
      { status: 500 }
    )
  }
}

// Configure middleware
export const config = {
  matcher: [
    '/api/admin/:path*',
    '/api/club/:path*',
    '/api/me/:path*',
    '/api/tablet/:path*',
    '/api/reports/:path*',
    // Add any other protected routes here
  ]
} 