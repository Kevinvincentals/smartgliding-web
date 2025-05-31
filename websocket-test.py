import websocket
import json
import threading
import time

# --- Configuration ---
# Adjust this URL if your Next.js app runs on a different host or port
WEBSOCKET_URL = "ws://localhost:3000/api/ws"
AUTH_PASSWORD = "websocket-password"  # Should match your server's AUTH_PASSWORD
CHANNEL_TO_JOIN = "EKAB"  # The channel you want to authenticate for
PING_INTERVAL_SECONDS = 20 # How often to send a ping to keep connection alive
# --- End Configuration ---

def on_message(ws, message_str):
    print(f"\n<<< Received from server: {message_str}")
    try:
        data = json.loads(message_str)

        if data.get("type") == "auth_required":
            print(">>> Server requested authentication. Sending auth details...")
            auth_payload = {
                "type": "auth",
                "password": AUTH_PASSWORD,
                "channel": CHANNEL_TO_JOIN
            }
            ws.send(json.dumps(auth_payload))
            print(f">>> Sent to server: {json.dumps(auth_payload)}")

        elif data.get("type") == "auth_success":
            print("+++ Authentication successful! Channel: {data.get('channel')}, ClientID: {data.get('clientId')} +++")
            # Example: Subscribe to plane tracker data after successful auth
            # time.sleep(1) # Small delay before sending next message
            # subscribe_payload = {
            #     "type": "subscribe",
            #     "topic": "plane-tracker" # Or any other topic you want to subscribe to
            # }
            # ws.send(json.dumps(subscribe_payload))
            # print(f">>> Sent to server (subscribe): {json.dumps(subscribe_payload)}")

        elif data.get("type") == "pong":
            print(f"+++ Received Pong from server (timestamp: {data.get('timestamp')}) +++")

        # Add more elif blocks here to handle other message types from the server
        # elif data.get("type") == "aircraft_data":
        #     print(f"Received aircraft data: {len(data.get('data', []))} aircraft.")

    except json.JSONDecodeError:
        print("--- Received non-JSON message or malformed JSON ---")
    except Exception as e:
        print(f"--- Error processing message: {e} ---")

def on_error(ws, error):
    print(f"\n--- WebSocket Error: {error} ---")

def on_close(ws, close_status_code, close_msg):
    status_message = f"--- WebSocket Connection Closed ---"
    if close_status_code or close_msg:
        status_message += f" Code: {close_status_code}, Reason: {close_msg}"
    print(status_message)

def on_open(ws):
    print("--- WebSocket Connection Opened ---")
    # The server should automatically send 'auth_required'.
    # Authentication is handled in the on_message callback.

def send_pings(ws):
    """Sends a ping to the server at regular intervals."""
    while True:
        time.sleep(PING_INTERVAL_SECONDS)
        if ws.sock and ws.sock.connected:
            try:
                ping_payload = {"type": "ping", "timestamp": int(time.time() * 1000)}
                print(f"\n>>> Sending Ping: {json.dumps(ping_payload)}")
                ws.send(json.dumps(ping_payload))
            except websocket.WebSocketConnectionClosedException:
                print("--- Ping failed: Connection was closed. ---")
                break
            except Exception as e:
                print(f"--- Error sending ping: {e} ---")
                break
        else:
            print("--- Ping thread: WebSocket not connected. Exiting ping thread. ---")
            break

if __name__ == "__main__":
    # To see detailed WebSocket communication, uncomment the next line:
    # websocket.enableTrace(True)

    print(f"Attempting to connect to WebSocket server at {WEBSOCKET_URL}...")
    ws_app = websocket.WebSocketApp(WEBSOCKET_URL,
                                  on_open=on_open,
                                  on_message=on_message,
                                  on_error=on_error,
                                  on_close=on_close)

    # Run the WebSocket client in a separate thread to keep it non-blocking
    ws_thread = threading.Thread(target=ws_app.run_forever)
    ws_thread.daemon = True  # Allow main program to exit even if this thread is running
    ws_thread.start()

    # Start a separate thread to send pings
    ping_thread = threading.Thread(target=send_pings, args=(ws_app,))
    ping_thread.daemon = True
    ping_thread.start()

    print("\nWebSocket client is running. Listening for messages.")
    print("Press Ctrl+C to exit.")

    try:
        # Keep the main thread alive. You can add other logic here if needed.
        # For example, to allow sending custom messages:
        while True:
            # Example: Allow user to send an echo message
            # if ws_app.sock and ws_app.sock.connected and ws_app.keep_running:
            #     raw_input = input("\nType a message to echo (or 'quit' to exit input mode): ")
            #     if raw_input.lower() == 'quit':
            #         break
            #     if raw_input:
            #         echo_payload = {"type": "echo", "content": raw_input}
            #         ws_app.send(json.dumps(echo_payload))
            #         print(f">>> Sent Echo Request: {json.dumps(echo_payload)}")
            # elif not ws_app.keep_running:
            #     break # Exit if WebSocketApp is no longer running
            time.sleep(1) # Check every second
            if not ws_thread.is_alive(): # If websocket thread stops for any reason
                print("--- WebSocket thread has stopped. Exiting main loop. ---")
                break


    except KeyboardInterrupt:
        print("\n--- KeyboardInterrupt received. Shutting down... ---")
    finally:
        if ws_app.sock and ws_app.sock.connected:
            print("--- Closing WebSocket connection... ---")
            ws_app.close()
        # Wait for threads to finish (optional, good practice)
        if ws_thread.is_alive():
            ws_thread.join(timeout=2)
        if ping_thread.is_alive():
            ping_thread.join(timeout=2)
        print("--- Client shutdown complete. ---")