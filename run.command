#!/bin/zsh
# Double-click to launch the ds-graph viewer's local server and open it in your browser.
cd "$(dirname "$0")/viewer" || exit 1

echo "Starting ds-graph viewer…"
npm run dev &
SERVER_PID=$!

# Give the server a moment to boot, then open the browser.
sleep 2
open "http://localhost:5173/"

# Keep this window open so you can stop the server with Ctrl+C or by closing it.
wait $SERVER_PID
