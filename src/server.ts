import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from 'zod';
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Server } from 'http';
import { Request, Response } from 'express';

export class MCPServer {
    private server: McpServer;
    private transport: StreamableHTTPServerTransport;
    private app: express.Application;
    private httpServer?: Server;
    private port: number;
    private fileListingCallback?: (path: string, recursive: boolean) => Promise<Array<{path: string, type: 'file' | 'directory'}>>;

    public setFileListingCallback(callback: (path: string, recursive: boolean) => Promise<Array<{path: string, type: 'file' | 'directory'}>>) {
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

        this.setupTools();
        this.setupRoutes();
        this.setupEventHandlers();
    }

    private setupTools(): void {
        // Add list_files tool
        this.server.tool(
            'list_files',
            'Lists files and directories in the VS Code workspace',
            {
                path: z.string().describe('The path to list files from'),
                recursive: z.boolean().optional().describe('Whether to list files recursively')
            },
            async ({ path, recursive = false }): Promise<CallToolResult> => {
                console.log(`[list_files] Tool called with path=${path}, recursive=${recursive}`);
                
                if (!this.fileListingCallback) {
                    console.error('[list_files] File listing callback not set');
                    throw new Error('File listing callback not set');
                }

                try {
                    console.log('[list_files] Calling file listing callback');
                    const files = await this.fileListingCallback(path, recursive);
                    console.log(`[list_files] Callback returned ${files.length} items`);
                    
                    const result: CallToolResult = {
                        content: [
                            {
                                type: 'text',
                                text: JSON.stringify(files, null, 2)
                            }
                        ]
                    };
                    console.log('[list_files] Successfully completed');
                    return result;
                } catch (error) {
                    console.error('[list_files] Error in tool:', error);
                    throw error;
                }
            }
        );
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