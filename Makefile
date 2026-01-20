.PHONY: build start stop restart clean logs

# Default target
all: build

# Build the project (development mode)
build:
	npm run dist:dev

# Build for production
build-prod:
	npm run dist:prod

# Start the server
start: build
	@echo "Starting ws-scrcpy server on port 9000..."
	@cd dist && node index.js &
	@sleep 2
	@lsof -ti :9000 > /dev/null && echo "Server started: http://localhost:9000" || echo "Failed to start server"

# Start without rebuilding
start-only:
	@echo "Starting ws-scrcpy server on port 9000..."
	@cd dist && node index.js &
	@sleep 2
	@lsof -ti :9000 > /dev/null && echo "Server started: http://localhost:9000" || echo "Failed to start server"

# Stop the server
stop:
	@echo "Stopping ws-scrcpy server..."
	@lsof -ti :9000 -sTCP:LISTEN | xargs kill -9 2>/dev/null || true
	@echo "Server stopped"

# Restart the server
restart: stop start

# Clean build artifacts
clean:
	npm run clean

# Show server status
status:
	@lsof -ti :9000 > /dev/null && echo "Server is running on port 9000" || echo "Server is not running"

# Show server logs (tail the process output)
logs:
	@lsof -ti :9000 > /dev/null && echo "Server PID: $$(lsof -ti :9000)" || echo "Server is not running"
