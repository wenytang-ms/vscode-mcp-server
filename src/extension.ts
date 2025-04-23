import * as vscode from 'vscode';
import { MCPServer } from './server';
import { listWorkspaceFiles } from './tools/file-tools';

// Re-export for testing purposes
export { MCPServer };

let mcpServer: MCPServer | undefined;
let statusBarItem: vscode.StatusBarItem | undefined;
let sharedTerminal: vscode.Terminal | undefined;

/**
 * Gets or creates the shared terminal for the extension
 * @param context The extension context
 * @returns The shared terminal instance
 */
export function getExtensionTerminal(context: vscode.ExtensionContext): vscode.Terminal {
    if (!sharedTerminal || sharedTerminal.exitStatus !== undefined) {
        // Create a new terminal if it doesn't exist or if it has exited
        sharedTerminal = vscode.window.createTerminal('MCP Shell Commands');
        console.log('[getExtensionTerminal] Created new terminal for shell commands');
    }
    return sharedTerminal;
}

// Function to update status bar
function updateStatusBar(port: number) {
    if (!statusBarItem) {
        return;
    }

    statusBarItem.text = `$(server) MCP Server: ${port}`;
    statusBarItem.tooltip = `MCP Server running at localhost:${port}`;
    statusBarItem.show();
}

export async function activate(context: vscode.ExtensionContext) {
    console.log('Activating vscode-mcp-server extension');

    try {
        // Get configuration
        const config = vscode.workspace.getConfiguration('vscode-mcp-server');
        const port = config.get<number>('port') || 3000;
        
        console.log(`[activate] Using port ${port} from configuration`);

        // Create the shared terminal
        const terminal = getExtensionTerminal(context);

        // Initialize MCP server with the configured port and terminal
        mcpServer = new MCPServer(port, terminal);

        // Set up file listing callback
        mcpServer.setFileListingCallback(async (path: string, recursive: boolean) => {
            try {
                return await listWorkspaceFiles(path, recursive);
            } catch (error) {
                console.error('Error listing files:', error);
                throw error;
            }
        });
        
        // Call setupTools after setting the callback
        mcpServer.setupTools();

        await mcpServer.start();
        console.log('MCP Server started successfully');

        // Create status bar item
        statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        statusBarItem.command = 'vscode-mcp-server.showServerInfo';
        updateStatusBar(port);

        // Register commands
        const statusCommand = vscode.commands.registerCommand('vscode-mcp-server.status', () => {
            vscode.window.showInformationMessage('MCP Server is running!');
        });

        const showServerInfoCommand = vscode.commands.registerCommand('vscode-mcp-server.showServerInfo', () => {
            vscode.window.showInformationMessage(`MCP Server is running at http://localhost:${port}/mcp`);
        });

        // Listen for configuration changes
        context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('vscode-mcp-server.port')) {
                    vscode.window.showInformationMessage(
                        'MCP Server port configuration changed. Please reload the window to apply the changes.',
                        'Reload'
                    ).then(selection => {
                        if (selection === 'Reload') {
                            vscode.commands.executeCommand('workbench.action.reloadWindow');
                        }
                    });
                }
            })
        );

        // Add all disposables to the context subscriptions
        context.subscriptions.push(
            statusBarItem,
            statusCommand,
            showServerInfoCommand,
            { dispose: async () => mcpServer && await mcpServer.stop() }
        );
    } catch (error) {
        console.error('Failed to start MCP Server:', error);
        vscode.window.showErrorMessage(`Failed to start MCP Server: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

export async function deactivate() {
    if (statusBarItem) {
        statusBarItem.dispose();
        statusBarItem = undefined;
    }

    // Dispose the shared terminal
    if (sharedTerminal) {
        sharedTerminal.dispose();
        sharedTerminal = undefined;
    }

    if (!mcpServer) return;
    
    try {
        await mcpServer.stop();
        console.log('MCP Server stopped successfully');
    } catch (error) {
        console.error('Error stopping MCP Server:', error);
        throw error; // Re-throw to ensure VS Code knows about the failure
    } finally {
        mcpServer = undefined;
    }
}