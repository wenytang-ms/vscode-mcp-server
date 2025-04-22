import * as vscode from 'vscode';
import { PlaceholderMCPServer } from './mcpServer';

let mcpServer: PlaceholderMCPServer | undefined;

export async function activate(context: vscode.ExtensionContext) {
	console.log('Activating vscode-mcp-server extension');

	try {
		mcpServer = new PlaceholderMCPServer(3000);
		await mcpServer.start();
		console.log('MCP Server started successfully');

		const disposable = vscode.commands.registerCommand('vscode-mcp-server.helloWorld', () => {
			vscode.window.showInformationMessage('MCP Server is running!');
		});

		context.subscriptions.push(disposable);
	} catch (error) {
		console.error('Failed to start MCP Server:', error);
		vscode.window.showErrorMessage('Failed to start MCP Server');
	}
}

export async function deactivate() {
	if (mcpServer) {
		try {
			await mcpServer.stop();
			console.log('MCP Server stopped successfully');
		} catch (error) {
			console.error('Error stopping MCP Server:', error);
		}
	}
}
