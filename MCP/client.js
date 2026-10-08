/**
 * MCP/client.js
 * Minimal server-side MCP client for the Streamable HTTP transport, built on
 * native fetch (no MCP SDK is installed in this project).
 *
 * Handles the negotiated lifecycle: initialize -> notifications/initialized ->
 * requests, carrying the Mcp-Session-Id and MCP-Protocol-Version headers when
 * the server issues them, and accepting either JSON or SSE response bodies.
 *
 * Never import this file from browser code.
 */

import { sanitizeErrorMessage } from '../lib/api-client.js';

export const MCP_DEFAULT_TIMEOUT_MS = 10000;

const CLIENT_INFO = { name: 'heirloom-table', version: '0.0.0' };
const REQUESTED_PROTOCOL_VERSION = '2025-06-18';
const SUPPORTED_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const MAX_TOOL_PAGES = 5;

/**
 * Error carrying the HTTP status this app should answer with (`httpStatus`)
 * separately from the status the upstream returned (`upstreamHttpStatus`).
 */
export class McpError extends Error {
  constructor(code, message, { httpStatus = 502, upstreamHttpStatus = null, stage = null } = {}) {
    super(message);
    this.name = 'McpError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.upstreamHttpStatus = upstreamHttpStatus;
    this.stage = stage;
  }
}

/**
 * Read and trim MCP configuration. Returns booleans only for what is set;
 * the raw values stay inside this module's callers.
 */
export function readMcpConfig() {
  const url = (process.env.NUTRIBALANCE_MCP_URL || '').trim();
  const apiKey = (process.env.SMITHERY_API_KEY || '').trim();
  return { url, apiKey, endpointConfigured: Boolean(url), keyConfigured: Boolean(apiKey) };
}

/**
 * Throws CONFIG_MISSING / CONFIG_INVALID before any upstream call is made.
 */
export function requireMcpConfig() {
  const config = readMcpConfig();

  if (!config.endpointConfigured) {
    throw new McpError(
      'CONFIG_MISSING',
      'NUTRIBALANCE_MCP_URL is not set. Add it in AI Studio Secrets and Vercel environment variables, then restart or redeploy.',
      { httpStatus: 503, stage: 'config' }
    );
  }

  let parsed;
  try {
    parsed = new URL(config.url);
  } catch (e) {
    parsed = null;
  }
  if (!parsed || parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new McpError(
      'CONFIG_INVALID',
      'NUTRIBALANCE_MCP_URL must be a plain https:// URL without embedded credentials.',
      { httpStatus: 503, stage: 'config' }
    );
  }

  if (!config.keyConfigured) {
    throw new McpError(
      'CONFIG_MISSING',
      'SMITHERY_API_KEY is not set. Add it in AI Studio Secrets and Vercel environment variables, then restart or redeploy.',
      { httpStatus: 503, stage: 'config' }
    );
  }

  return config;
}

/**
 * Parse an SSE body and return the JSON-RPC message answering `requestId`.
 */
function extractSseMessage(text, requestId) {
  const events = text.split(/\r?\n\r?\n/);
  for (const event of events) {
    const data = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).replace(/^ /, ''))
      .join('\n');
    if (!data) continue;
    let message;
    try {
      message = JSON.parse(data);
    } catch (e) {
      continue;
    }
    if (message && message.id === requestId) return message;
  }
  return null;
}

/**
 * One connection to an MCP endpoint. All calls share a single deadline so the
 * whole exchange stays inside `timeoutMs`.
 */
export class McpSession {
  constructor({ url, apiKey, timeoutMs = MCP_DEFAULT_TIMEOUT_MS }) {
    this.url = url;
    this.apiKey = apiKey;
    this.deadline = Date.now() + timeoutMs;
    this.timeoutMs = timeoutMs;
    this.sessionId = null;
    this.protocolVersion = null;
    this.nextId = 1;
    this.lastHttpStatus = null;
    this.serverInfo = null;
  }

  async post(payload, stage) {
    const remaining = this.deadline - Date.now();
    if (remaining <= 0) {
      throw new McpError('UPSTREAM_TIMEOUT', `NutriBalance MCP timed out after ${this.timeoutMs}ms`, {
        httpStatus: 504,
        stage,
      });
    }

    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      Authorization: `Bearer ${this.apiKey}`,
    };
    if (this.sessionId) headers['Mcp-Session-Id'] = this.sessionId;
    if (this.protocolVersion) headers['MCP-Protocol-Version'] = this.protocolVersion;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remaining);

    try {
      let response;
      try {
        response = await fetch(this.url, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
          signal: controller.signal,
          redirect: 'error',
        });
      } catch (err) {
        if (err.name === 'AbortError') {
          throw new McpError('UPSTREAM_TIMEOUT', `NutriBalance MCP timed out after ${this.timeoutMs}ms`, {
            httpStatus: 504,
            stage,
          });
        }
        throw new McpError('UPSTREAM_UNREACHABLE', 'Could not reach the NutriBalance MCP endpoint.', {
          httpStatus: 502,
          stage,
        });
      }

      this.lastHttpStatus = response.status;

      // Check response.ok before trusting the body; failed bodies may be empty or non-JSON.
      if (!response.ok) {
        await response.text().catch(() => '');
        if (response.status === 401 || response.status === 403) {
          throw new McpError(
            'UPSTREAM_AUTH',
            `NutriBalance MCP rejected the credential (HTTP ${response.status}). Check SMITHERY_API_KEY.`,
            { httpStatus: 502, upstreamHttpStatus: response.status, stage }
          );
        }
        // The Smithery gateway answers 404 for a bad token as well as for an unknown namespace.
        if (response.status === 404) {
          throw new McpError(
            'UPSTREAM_NOT_FOUND',
            'NutriBalance MCP returned HTTP 404: the credential was not accepted or the endpoint does not exist. Check SMITHERY_API_KEY and NUTRIBALANCE_MCP_URL.',
            { httpStatus: 502, upstreamHttpStatus: 404, stage }
          );
        }
        throw new McpError('UPSTREAM_HTTP', `NutriBalance MCP returned HTTP ${response.status}.`, {
          httpStatus: 502,
          upstreamHttpStatus: response.status,
          stage,
        });
      }

      const issuedSession = response.headers.get('mcp-session-id');
      if (issuedSession) this.sessionId = issuedSession;

      // Notifications carry no id and are acknowledged without a body (202).
      if (payload.id === undefined) {
        await response.text().catch(() => '');
        return null;
      }

      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      const text = await response.text();
      let message = null;

      if (contentType.includes('application/json')) {
        try {
          message = JSON.parse(text);
        } catch (e) {
          message = null;
        }
        if (Array.isArray(message)) message = message.find((m) => m && m.id === payload.id) || null;
      } else if (contentType.includes('text/event-stream')) {
        message = extractSseMessage(text, payload.id);
      } else {
        throw new McpError('UPSTREAM_PROTOCOL', 'NutriBalance MCP returned an unexpected content type.', {
          httpStatus: 502,
          upstreamHttpStatus: response.status,
          stage,
        });
      }

      if (!message || message.jsonrpc !== '2.0' || message.id !== payload.id) {
        throw new McpError('UPSTREAM_PROTOCOL', 'NutriBalance MCP returned an empty or malformed JSON-RPC response.', {
          httpStatus: 502,
          upstreamHttpStatus: response.status,
          stage,
        });
      }

      if (message.error) {
        const reason = sanitizeErrorMessage(String(message.error.message || 'unknown error')).slice(0, 200);
        throw new McpError('UPSTREAM_JSONRPC_ERROR', `NutriBalance MCP JSON-RPC error: ${reason}`, {
          httpStatus: 502,
          upstreamHttpStatus: response.status,
          stage,
        });
      }

      if (message.result === undefined || message.result === null || typeof message.result !== 'object') {
        throw new McpError('UPSTREAM_PROTOCOL', 'NutriBalance MCP response had no result.', {
          httpStatus: 502,
          upstreamHttpStatus: response.status,
          stage,
        });
      }

      return message.result;
    } finally {
      clearTimeout(timer);
    }
  }

  request(method, params, stage) {
    const payload = { jsonrpc: '2.0', id: this.nextId++, method };
    if (params !== undefined) payload.params = params;
    return this.post(payload, stage);
  }

  async initialize() {
    const result = await this.request(
      'initialize',
      { protocolVersion: REQUESTED_PROTOCOL_VERSION, capabilities: {}, clientInfo: CLIENT_INFO },
      'initialize'
    );

    if (!SUPPORTED_PROTOCOL_VERSIONS.includes(result.protocolVersion)) {
      throw new McpError('UPSTREAM_PROTOCOL', 'NutriBalance MCP negotiated an unsupported protocol version.', {
        httpStatus: 502,
        upstreamHttpStatus: this.lastHttpStatus,
        stage: 'initialize',
      });
    }

    this.protocolVersion = result.protocolVersion;
    this.serverInfo = result.serverInfo || null;
    await this.post({ jsonrpc: '2.0', method: 'notifications/initialized' }, 'initialize');
    return result;
  }

  async listTools() {
    const tools = [];
    let cursor;
    for (let page = 0; page < MAX_TOOL_PAGES; page++) {
      const result = await this.request('tools/list', cursor ? { cursor } : {}, 'discovery');
      if (!Array.isArray(result.tools)) {
        throw new McpError('UPSTREAM_PROTOCOL', 'NutriBalance MCP tool discovery returned no tool list.', {
          httpStatus: 502,
          upstreamHttpStatus: this.lastHttpStatus,
          stage: 'discovery',
        });
      }
      tools.push(...result.tools);
      cursor = result.nextCursor;
      if (!cursor) break;
    }
    return tools;
  }

  callTool(name, args) {
    return this.request('tools/call', { name, arguments: args }, 'tool');
  }
}
