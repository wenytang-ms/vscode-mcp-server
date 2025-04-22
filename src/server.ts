import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Server } from 'http';
import { Request, Response } from 'express';
import { registerFileTools, FileListingCallback } from './tools/file-tools';

export class MCPServer {
    private server: McpServer;
    private transport: StreamableHTTPServerTransport;
    private app: express.Application;
    private httpServer?: Server;
    private port: number;
    private fileListingCallback?: FileListingCallback;

    public setFileListingCallback(callback: FileListingCallback) {
        this.fileListingCallback = callback;
    }

    constructor(port: number = 3000) {
        this.port = port;
        this.app = express();
        this.app.use(express.json());

        // Initialize MCP Server
        this.server = new McpServer({
            name: "vscode-mcp-server",
            version: "1.0.0",
        }, {
            capabilities: {
                logging: {},
                tools: {
                    listChanged: false
                }
            }
        });

        // Initialize transport
        this.transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
        });

        // Note: setupTools() is no longer called here
        this.setupRoutes();
        this.setupEventHandlers();
    }

    public setupTools(): void {
        // Register tools from the tools module
        if (this.fileListingCallback) {
            registerFileTools(this.server, this.fileListingCallback);
            console.log('MCP tools registered successfully');
        } else {
            console.warn('File listing callback not set during tools setup');
        }
    }

    private setupRoutes(): void {
        // Handle POST requests for client-to-server communication
        this.app.post('/mcp', async (req, res) => {
            console.log(`Request received: ${req.method} ${req.url}`, { body: req.body });
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

        // Handle SSE endpoint for server-to-client streaming
        this.app.get('/mcp/sse', async (req, res) => {
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

        // Handle unsupported methods
        this.app.get('/mcp', async (req, res) => {
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

        this.app.delete('/mcp', async (req, res) => {
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

        // Handle OPTIONS requests for CORS
        this.app.options('/mcp', (req, res) => {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
            res.status(204).end();
        });
    }

    private setupEventHandlers(): void {
        // Log HTTP server events
        if (this.httpServer) {
            this.httpServer.on('error', (error: Error) => {
                console.error(`[Server] HTTP Server Error:`, error);
            });

            this.httpServer.on('listening', () => {
                console.log(`[Server] HTTP Server ready`);
            });

            this.httpServer.on('close', () => {
                console.log(`[Server] HTTP Server closed`);
            });
        }
    }

    public async start(): Promise<void> {
        try {
            // Connect transport before starting server
            await this.server.connect(this.transport);

            // Start HTTP server
            return new Promise((resolve) => {
                this.httpServer = this.app.listen(this.port, () => {
                    console.log(`MCP Server listening on port ${this.port}`);
                    resolve();
                });
            });
        } catch (error) {
            console.error('Failed to start MCP Server:', error);
            throw error;
        }
    }

    public async stop(): Promise<void> {
        try {
            // Close HTTP server
            if (this.httpServer) {
                await new Promise<void>((resolve, reject) => {
                    this.httpServer!.close((err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                });
            }

            // Close transport and server
            await this.transport.close();
            await this.server.close();
            
            console.log('MCP Server shutdown complete');
        } catch (error) {
            console.error('Error during server shutdown:', error);
            throw error;
        }
    }
}