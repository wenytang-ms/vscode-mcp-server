import express from "express";
import { Request, Response } from 'express';
import { randomUUID } from "node:crypto";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

export class PlaceholderMCPServer {
    private app: express.Application;
    private server: McpServer;
    private transport: StreamableHTTPServerTransport;
    private port: number;

    constructor(port: number = 3000) {
        this.port = port;
        this.app = express();
        this.app.use(express.json());
        
        // Add CORS headers
        this.app.use((req, res, next) => {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
            next();
        });

        this.server = new McpServer({
            name: "Echo-Server",
            displayName: "Echo MCP Server",
            version: "1.0.0"
        });

        // Add echo resource
        this.server.resource(
            "echo",
            new ResourceTemplate("echo://{message}", { list: undefined }),
            async (uri, { message }) => ({
                contents: [{
                    uri: uri.href,
                    text: `Resource echo: ${message}`
                }]
            })
        );

        // Add echo tool
        this.server.tool(
            "echo",
            { message: z.string() },
            async ({ message }) => ({
                content: [{ type: "text", text: `Tool echo: ${message}` }]
            })
        );

        // Add echo prompt
        this.server.prompt(
            "echo",
            { message: z.string() },
            ({ message }) => ({
                messages: [{
                    role: "user",
                    content: {
                        type: "text",
                        text: `Please process this message: ${message}`
                    }
                }]
            })
        );

        this.transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined, // set to undefined for stateless servers
        });

        this.setupRoutes();
    }

    private setupRoutes() {
        this.app.post('/mcp', async (req: Request, res: Response) => {
            console.log('Received MCP request:', req.body);
            try {
                await this.transport.handleRequest(req, res, req.body);
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

        this.app.get('/mcp/sse', async (req: Request, res: Response) => {
            console.log('Received SSE connection request');
            try {
                await this.transport.handleRequest(req, res, undefined);
            } catch (error) {
                console.error('Error handling SSE request:', error);
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

        this.app.delete('/mcp', async (req: Request, res: Response) => {
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

        // Handle OPTIONS requests for CORS preflight
        this.app.options('/mcp', (req: Request, res: Response) => {
            res.status(204).end();
        });
    }

    public async start(): Promise<void> {
        // Connect transport before starting server
        await this.server.connect(this.transport);

        // Start listening
        return new Promise((resolve) => {
            this.app.listen(this.port, () => {
                console.log(`MCP Streamable HTTP Server listening on port ${this.port}`);
                resolve();
            });
        });
    }

    public async stop(): Promise<void> {
        // Currently no explicit disconnect method needed
        console.log('MCP Server stopping...');
    }
}