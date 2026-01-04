import { McpError, ErrorCode } from "@modelcontextprotocol/sdk/types.js";

// Basic rate limiting for API protection
export class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private maxRequests: number;
  private timeWindow: number;

  constructor(maxRequests: number = 1000, timeWindow: number = 60000) {
    // 1000 requests per minute for local usage
    this.maxRequests = maxRequests;
    this.timeWindow = timeWindow;
  }

  checkLimit(clientId: string): boolean {
    const now = Date.now();
    const timestamps = this.requests.get(clientId) || [];

    // Remove old timestamps
    const validTimestamps = timestamps.filter(
      (time) => now - time < this.timeWindow
    );

    if (validTimestamps.length >= this.maxRequests) {
      return false;
    }

    validTimestamps.push(now);
    this.requests.set(clientId, validTimestamps);
    return true;
  }
}

// Message size validation to prevent memory issues
const MAX_MESSAGE_SIZE = 5 * 1024 * 1024; // 5MB for local usage

export function validateMessageSize(message: any): void {
  const size = new TextEncoder().encode(JSON.stringify(message)).length;
  if (size > MAX_MESSAGE_SIZE) {
    throw new McpError(
      ErrorCode.InvalidRequest,
      `Message size exceeds limit of ${MAX_MESSAGE_SIZE} bytes`
    );
  }
}

// Connection health monitoring
export class ConnectionMonitor {
  private lastActivity: number = Date.now();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private readonly timeout: number;
  private readonly gracePeriod: number;
  private readonly heartbeat: number;
  private initialized: boolean = false;

  constructor(
    timeout: number = 300000,
    gracePeriod: number = 60000,
    heartbeat: number = 30000
  ) {
    // 5min timeout, 1min grace period, 30s heartbeat
    this.timeout = timeout;
    this.gracePeriod = gracePeriod;
    this.heartbeat = heartbeat;
  }

  updateActivity() {
    this.lastActivity = Date.now();
  }

  start(onTimeout: () => void) {
    // Start monitoring after grace period
    setTimeout(() => {
      this.initialized = true;

      // Set up heartbeat to keep connection alive
      this.heartbeatInterval = setInterval(() => {
        // The heartbeat itself counts as activity
        this.updateActivity();
      }, this.heartbeat);

      // Set up health check
      this.healthCheckInterval = setInterval(() => {
        const now = Date.now();
        const inactiveTime = now - this.lastActivity;

        if (inactiveTime > this.timeout) {
          onTimeout();
        }
      }, 10000); // Check every 10 seconds
    }, this.gracePeriod);
  }

  stop() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
}
