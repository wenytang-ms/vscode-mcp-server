import * as vscode from 'vscode';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from 'zod';
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/**
 * Registers MCP command-related tools with the server
 * @param server MCP server instance
 */
export function registerCommandTools(server: McpServer): void {
    // Add create_file tool
    server.tool('trigger command',
        `Trigger command in VS Code, this tool allows you to execute a command in the VS Code environment.
        `,
        {
            command: z.string().describe('the command to be execute in vscode')
        },
        async ({ command }): Promise<CallToolResult> => {
            console.log(`[trigger command] Received input: ${command}`);
            try {
                if (!vscode.workspace.workspaceFolders) {
                    throw new Error('No workspace folder is open');
                }
                await vscode.commands.executeCommand(command);
                const result: CallToolResult = {
                    content: [
                        {
                            type: 'text',
                            text: `command ${command} executed successfully`
                        }
                    ]
                };
                return result;
            } catch (error) {
                console.error(`[trigger command] Error: `, error);
                throw error;
            }
        }
    );
}