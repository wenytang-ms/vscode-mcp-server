import * as vscode from 'vscode';
import * as path from 'path';
import { MCPServer } from './server';

// Re-export for testing purposes
export { MCPServer };

let mcpServer: MCPServer | undefined;
let statusBarItem: vscode.StatusBarItem | undefined;

// Function to list files in workspace
async function listWorkspaceFiles(workspacePath: string, recursive: boolean = false): Promise<Array<{path: string, type: 'file' | 'directory'}>> {
    console.log(`[listWorkspaceFiles] Starting with path: ${workspacePath}, recursive: ${recursive}`);
    
    if (!vscode.workspace.workspaceFolders) {
        throw new Error('No workspace folder is open');
    }

    const workspaceFolder = vscode.workspace.workspaceFolders[0];
    const workspaceUri = workspaceFolder.uri;
    
    // Create URI for the target directory
    const targetUri = vscode.Uri.joinPath(workspaceUri, workspacePath);
    console.log(`[listWorkspaceFiles] Target URI: ${targetUri.fsPath}`);

    async function processDirectory(dirUri: vscode.Uri, currentPath: string = ''): Promise<Array<{path: string, type: 'file' | 'directory'}>> {
        const entries = await vscode.workspace.fs.readDirectory(dirUri);
        const result: Array<{path: string, type: 'file' | 'directory'}> = [];

        for (const [name, type] of entries) {
            const entryPath = currentPath ? path.join(currentPath, name) : name;
            const itemType: 'file' | 'directory' = (type & vscode.FileType.Directory) ? 'directory' : 'file';
            
            result.push({ path: entryPath, type: itemType });

            if (recursive && itemType === 'directory') {
                const subDirUri = vscode.Uri.joinPath(dirUri, name);
                const subEntries = await processDirectory(subDirUri, entryPath);
                result.push(...subEntries);
            }
        }

        return result;
    }

    try {
        const result = await processDirectory(targetUri);
        console.log(`[listWorkspaceFiles] Found ${result.length} entries`);
        return result;
    } catch (error) {
        console.error('[listWorkspaceFiles] Error:', error);
        throw error;
    }
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

        // Initialize MCP server with the configured port
        mcpServer = new MCPServer(port);

        // Set up file listing callback
        mcpServer.setFileListingCallback(async (path: string, recursive: boolean) => {
            try {
                return await listWorkspaceFiles(path, recursive);
            } catch (error) {
                console.error('Error listing files:', error);
                throw error;
            }
        });

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
