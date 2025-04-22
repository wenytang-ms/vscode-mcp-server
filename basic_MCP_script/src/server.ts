import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from 'zod';
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js"

const PORT = process.env.PORT || 3000;

console.log("Initializing MCP Streamable-HTTP Server with Express - No Session Support")


const server = new McpServer({
  name: "streamable-mcp-server",
  version: "1.0.0",
}, {
  capabilities: {
    logging: {},
    tools: {
      listChanged: false
    }
  }
});


// ... set up server resources, tools, and prompts ...
server.tool(
  'greet',
  'A simple greeting tool',
  {
    name: z.string().describe('Name to greet'),
  },
  async ({ name }): Promise<CallToolResult> => {
    console.log(`Tool Called: greet (name=${name})`);
    return {
      content: [
        {
          type: 'text',
          text: `Hello, ${name}!`,
        },
      ],
    };
  }
);

// Register a tool that sends multiple greetings with notifications
server.tool(
  'multi-greet',
  'A tool that sends different greetings with delays between them',
  {
    name: z.string().describe('Name to greet'),
  },
  async ({ name }, { sendNotification }): Promise<CallToolResult> => {
    console.log(`Tool Called: multi-greet (name=${name})`);
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    await sendNotification({
      method: "notifications/message",
      params: { level: "debug", data: `Starting multi-greet for ${name}` }
    });

    await sleep(1000); // Wait 1 second before first greeting

    await sendNotification({
      method: "notifications/message",
      params: { level: "info", data: `Sending first greeting to ${name}` }
    });

    await sleep(1000); // Wait another second before second greeting

    await sendNotification({
      method: "notifications/message",
      params: { level: "info", data: `Sending second greeting to ${name}` }
    });

    return {
      content: [
        {
          type: 'text',
          text: `Good morning, ${name}!`,
        }
      ],
    };
  }
);

const app = express();
app.use(express.json());


const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
  sessionIdGenerator: undefined,
});

const setupServer = async () => {
  await server.connect(transport);
};
// Handle POST requests for client-to-server communication
app.post('/mcp', async (req, res) => {
  console.log(`Request received: ${req.method} ${req.url}`, {body: req.body});
  try {
      await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('Error handling MCP request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: null,
      });
    }
  }
});

app.get('/mcp', async (req: express.Request, res: express.Response) => {
  console.log('Received GET MCP request');
  res.writeHead(405).end(JSON.stringify({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "Method not allowed."
    },
    id: null
  }));
});

app.delete('/mcp', async (req: express.Request, res: express.Response) => {
  console.log('Received DELETE MCP request');
  res.writeHead(405).end(JSON.stringify({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "Method not allowed."
    },
    id: null
  }));
});


// let express_server: any;
setupServer().then(() => {
  const express_server = app.listen(PORT, () => {
    console.log(`MCP Streamable HTTP Server listening on port ${PORT}`);
  });

  // Add server event listeners for better visibility
  express_server.on('connect', (transport) => {
    console.log(`[Server] Transport connected: ${transport}`);
  });

  express_server.on('disconnect', (transport) => {
    console.log(`[Server] Transport disconnected`);
  });

  express_server.on('request', (request, transport) => {
    console.log(`[Server] Received request: ${request.method} from transport: ${transport}`);
  });

  express_server.on('response', (response, transport) => {
    console.log(`[Server] Sending response for id: ${response.id} to transport`);
  });

  express_server.on('notification', (notification, transport) => {
    console.log(`[Server] Sending notification: ${notification.method} to transport`);
  });

  express_server.on('error', (error: any, transport: any) => {
    console.error(`[Server] Error with transport:`, error);
  });
}).catch(error => {
  console.error('Error setting up server:', error);
  process.exit(1);
});


// Handle server shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down server...');
  await transport.close()
  // await express_server.close();
  await server.close();
  console.log('Server shutdown complete');
  process.exit(0);
});
