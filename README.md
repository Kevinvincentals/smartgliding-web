# API Testing Guide

## Postman Collection

A Postman collection has been created to test the API endpoints. The collection file is located at:

```
/postman_collection.json
```

## How to Use the Postman Collection

1. Download and install [Postman](https://www.postman.com/downloads/)
2. Import the collection:
   - Open Postman
   - Click on "Import" button
   - Select the `postman_collection.json` file
   - Click "Import"

3. Set up environment variables:
   - Create a new environment in Postman
   - Add the following variables:
     - `base_url`: The base URL of your API (default: http://localhost:3000)
     - `access_token`: This will be populated automatically after a successful login

4. Testing Authentication:
   - First use the "Signup" endpoint to create a new user
   - Then use the "Signin" endpoint to get an access token
   - The access token will be automatically set for subsequent requests

5. Testing other endpoints:
   - All endpoints requiring authentication will use the access token
   - Make sure to replace placeholder values (like "club-id-here") with actual IDs

## API Endpoints Structure

The API is organized into the following sections:

1. **Auth** - Authentication endpoints
   - Signup
   - Signin
   - Refresh Token
   - Verify Account

2. **Me** - Current user endpoints
   - Get Current User

3. **Admin** - Global admin endpoints
   - Create Club
   - Assign Pilot
   - Unassign Pilot
   - Update Role
   - Delete Club

4. **Club Admin** - Club management endpoints
   - Create/Get/Update Pilots
   - Create/Get/Update/Delete Planes 