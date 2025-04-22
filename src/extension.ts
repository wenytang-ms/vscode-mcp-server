import * as vscode from 'vscode';
import * as path from 'path';
import { MCPServer } from './server';

let mcpServer: MCPServer | undefined;

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

export async function activate(context: vscode.ExtensionContext) {
	console.log('Activating vscode-mcp-server extension');

	try {
		// Initialize MCP server with workspace file listing capability
		mcpServer = new MCPServer(3000);

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

		// Register a command that shows the MCP server status
		const disposable = vscode.commands.registerCommand('vscode-mcp-server.status', () => {
			vscode.window.showInformationMessage('MCP Server is running!');
		});

		// Make sure the server is stopped when the extension is deactivated
		context.subscriptions.push(
			disposable,
			{ dispose: async () => mcpServer && await mcpServer.stop() }
		);
	} catch (error) {
		console.error('Failed to start MCP Server:', error);
		vscode.window.showErrorMessage(`Failed to start MCP Server: ${error instanceof Error ? error.message : 'Unknown error'}`);
	}
}

export async function deactivate() {
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
