import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import { z } from "zod/v4";
import { chat, getModels, getWorkflows } from "./timely-client.js";

const app = express();
app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// --- MCP Server Factory ---
function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "timely-mcp-server",
    version: "1.0.0",
  });

  // Tool: Chat with TimelyGPT
  server.registerTool("timely_chat", {
    title: "TimelyGPT Chat",
    description:
      "Send a message to TimelyGPT and get an AI response. Supports multiple models.",
    inputSchema: {
      message: z.string().describe("The message to send"),
      model: z
        .string()
        .optional()
        .describe("Model to use (e.g. claude-haiku-4-5, gpt-4.1)"),
      instructions: z
        .string()
        .optional()
        .describe("System instructions for the AI"),
    },
  }, async ({ message, model, instructions }) => {
    try {
      const result = await chat({
        messages: [{ role: "user", content: message }],
        model: model || undefined,
        instructions: instructions || undefined,
      });

      const text =
        result.message || result.content || JSON.stringify(result);

      return {
        content: [{ type: "text" as const, text }],
      };
    } catch (err: any) {
      return {
        content: [{ type: "text" as const, text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  });

  // Tool: List available models
  server.registerTool("timely_models", {
    title: "TimelyGPT Models",
    description: "List all available AI models on TimelyGPT",
    inputSchema: {},
  }, async () => {
    try {
      const models = await getModels();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(models, null, 2),
          },
        ],
      };
    } catch (err: any) {
      return {
        content: [{ type: "text" as const, text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  });

  // Tool: List workflows
  server.registerTool("timely_workflows", {
    title: "TimelyGPT Workflows",
    description: "List all available AI workflows on TimelyGPT",
    inputSchema: {},
  }, async () => {
    try {
      const workflows = await getWorkflows();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(workflows, null, 2),
          },
        ],
      };
    } catch (err: any) {
      return {
        content: [{ type: "text" as const, text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  });

  return server;
}

// --- Transport Management ---
const transports: Record<string, StreamableHTTPServerTransport> = {};

// MCP POST handler
app.post("/mcp", async (req, res) => {
  try {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports[sessionId]) {
      transport = transports[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          transports[sid] = transport;
        },
      });

      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid && transports[sid]) {
          delete transports[sid];
        }
      };

      const server = createMcpServer();
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    } else {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Bad Request: No valid session ID" },
        id: null,
      });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("Error handling MCP request:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

// MCP GET handler (SSE streams)
app.get("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }
  await transports[sessionId].handleRequest(req, res);
});

// MCP DELETE handler (session termination)
app.delete("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }
  await transports[sessionId].handleRequest(req, res);
});

// --- Start ---
const PORT = parseInt(process.env.PORT || "3000", 10);
app.listen(PORT, () => {
  console.log(`TimelyGPT MCP Server running on port ${PORT}`);
});
