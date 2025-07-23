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
    server.tool('execute_vs_command',
        `Execute command in VS Code, this tool allows you to execute a command in the VS Code environment.
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

    server.tool(
        'list_vs_commands',
        `List all available commands in VS Code with optional filtering. This tool allows you to retrieve a list of
        all commands that can be executed in the VS Code environment, with options to filter by prefix, contains text, or limit results.
        `,
        {
            filterInternal: z.boolean().optional().describe('Filter out internal commands (starting with underscore). Default: true'),
            prefix: z.string().optional().describe('Filter commands that start with this prefix'),
            contains: z.string().optional().describe('Filter commands that contain this text'),
            limit: z.number().optional().describe('Limit the number of results returned. Default: 50'),
            category: z.string().optional().describe('Filter commands by category (e.g., "editor", "workbench", "git", etc.)')
        },
        async ({ filterInternal = true, prefix, contains, limit = 50, category }): Promise<CallToolResult> => {
            try {
                // Get all commands from VS Code
                let commands = await vscode.commands.getCommands(filterInternal);
                
                // Apply prefix filter
                if (prefix) {
                    commands = commands.filter(cmd => cmd.startsWith(prefix));
                }
                
                // Apply contains filter
                if (contains) {
                    commands = commands.filter(cmd => cmd.toLowerCase().includes(contains.toLowerCase()));
                }
                
                // Apply category filter
                if (category) {
                    commands = commands.filter(cmd => cmd.startsWith(category + '.') || cmd.includes(category));
                }
                
                // Apply limit
                const totalCount = commands.length;
                commands = commands.slice(0, limit);
                
                const result: CallToolResult = {
                    content: [
                        {
                            type: 'text',
                            text: `Found ${totalCount} matching commands${totalCount > limit ? ` (showing first ${limit})` : ''}:\n\n${commands.join('\n')}`
                        }
                    ]
                };
                return result;
            } catch (error) {
                console.error(`[list commands] Error: `, error);
                throw error;
            }
        }
    );

    server.tool(
        'get_commands_by_category',
        `Get commands grouped by common VS Code categories. This helps you find commands related to specific functionality.`,
        {
            showCount: z.boolean().optional().describe('Show count of commands in each category. Default: true')
        },
        async ({ showCount = true }): Promise<CallToolResult> => {
            try {
                const commands = await vscode.commands.getCommands(true);
                
                // Common VS Code command categories
                const categories = {
                    'Editor': commands.filter(cmd => cmd.startsWith('editor.')),
                    'Workbench': commands.filter(cmd => cmd.startsWith('workbench.')),
                    'File': commands.filter(cmd => cmd.startsWith('file.') || cmd.startsWith('explorer.')),
                    'Git': commands.filter(cmd => cmd.startsWith('git.')),
                    'Debug': commands.filter(cmd => cmd.startsWith('debug.')),
                    'Terminal': commands.filter(cmd => cmd.startsWith('terminal.')),
                    'Search': commands.filter(cmd => cmd.startsWith('search.')),
                    'APICenter': commands.filter(cmd => cmd.startsWith('azure-api-center.')),
                    'Language': commands.filter(cmd => cmd.includes('language') || cmd.includes('typescript') || cmd.includes('javascript')),
                    'Refactor': commands.filter(cmd => cmd.includes('refactor')),
                    'Format': commands.filter(cmd => cmd.includes('format')),
                    'Selection': commands.filter(cmd => cmd.includes('selection') || cmd.includes('cursor')),
                    'Navigation': commands.filter(cmd => cmd.includes('go') || cmd.includes('navigate')),
                    'View': commands.filter(cmd => cmd.startsWith('view.') || cmd.startsWith('toggle')),
                    'Tasks': commands.filter(cmd => cmd.startsWith('task.')),
                };
                
                let result = 'VS Code Commands by Category:\n\n';
                
                for (const [categoryName, categoryCommands] of Object.entries(categories)) {
                    if (categoryCommands.length > 0) {
                        result += `## ${categoryName}${showCount ? ` (${categoryCommands.length} commands)` : ''}\n`;
                        result += categoryCommands.slice(0, 10).join('\n') + '\n';
                        if (categoryCommands.length > 10) {
                            result += `... and ${categoryCommands.length - 10} more\n`;
                        }
                        result += '\n';
                    }
                }
                
                return {
                    content: [
                        {
                            type: 'text',
                            text: result
                        }
                    ]
                };
            } catch (error) {
                console.error(`[get commands by category] Error: `, error);
                throw error;
            }
        }
    );
}