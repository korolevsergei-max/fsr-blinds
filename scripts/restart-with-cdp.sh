#!/bin/bash

# Close any running instances of Antigravity (using -f to catch all processes)
echo "Closing Antigravity..."
pkill -f Antigravity || true
sleep 2

# Restart Antigravity with the remote debugging port enabled
echo "Restarting Antigravity with CDP enabled on port 9000..."
# Using the full path to the executable to be safe
open -a "/Applications/Antigravity.app" --args --remote-debugging-port=9000 &

echo "Done! Antigravity is restarting in the background."
