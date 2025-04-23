import * as vscode from 'vscode';
import * as path from 'path';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from 'zod';
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// Type for file listing results
export type FileListingResult = Array<{path: string, type: 'file' | 'directory'}>;

// Type for the file listing callback function
export type FileListingCallback = (path: string, recursive: boolean) => Promise<FileListingResult>;

// Default maximum character count
const DEFAULT_MAX_CHARACTERS = 100000;

/**
 * Lists files and directories in the VS Code workspace
 * @param workspacePath The path within the workspace to list files from
 * @param recursive Whether to list files recursively
 * @returns Array of file and directory entries
 */
export async function listWorkspaceFiles(workspacePath: string, recursive: boolean = false): Promise<FileListingResult> {
    console.log(`[listWorkspaceFiles] Starting with path: ${workspacePath}, recursive: ${recursive}`);
    
    if (!vscode.workspace.workspaceFolders) {
        throw new Error('No workspace folder is open');
    }

    const workspaceFolder = vscode.workspace.workspaceFolders[0];
    const workspaceUri = workspaceFolder.uri;
    
    // Create URI for the target directory
    const targetUri = vscode.Uri.joinPath(workspaceUri, workspacePath);
    console.log(`[listWorkspaceFiles] Target URI: ${targetUri.fsPath}`);

    async function processDirectory(dirUri: vscode.Uri, currentPath: string = ''): Promise<FileListingResult> {
        const entries = await vscode.workspace.fs.readDirectory(dirUri);
        const result: FileListingResult = [];

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

/**
 * Reads a file from the VS Code workspace with character limit check
 * @param workspacePath The path within the workspace to the file
 * @param encoding Optional encoding to convert the file content to a string
 * @param maxCharacters Maximum character count (default: 100,000)
 * @returns File content as Uint8Array or string if encoding is provided
 */
export async function readWorkspaceFile(
    workspacePath: string, 
    encoding?: string | null, 
    maxCharacters: number = DEFAULT_MAX_CHARACTERS
): Promise<Uint8Array | string> {
    console.log(`[readWorkspaceFile] Starting with path: ${workspacePath}, encoding: ${encoding || 'none'}, maxCharacters: ${maxCharacters}`);
    
    if (!vscode.workspace.workspaceFolders) {
        throw new Error('No workspace folder is open');
    }

    const workspaceFolder = vscode.workspace.workspaceFolders[0];
    const workspaceUri = workspaceFolder.uri;
    
    // Create URI for the target file
    const fileUri = vscode.Uri.joinPath(workspaceUri, workspacePath);
    console.log(`[readWorkspaceFile] File URI: ${fileUri.fsPath}`);

    try {
        // Read the file content as Uint8Array
        const fileContent = await vscode.workspace.fs.readFile(fileUri);
        console.log(`[readWorkspaceFile] File read successfully, size: ${fileContent.byteLength} bytes`);
        
        // If encoding is provided, convert to string and check character count
        if (encoding) {
            const textDecoder = new TextDecoder(encoding);
            const textContent = textDecoder.decode(fileContent);
            
            // Check if the character count exceeds the limit
            if (textContent.length > maxCharacters) {
                throw new Error(`File content exceeds the maximum character limit (${textContent.length} vs ${maxCharacters} allowed)`);
            }
            
            return textContent;
        } else {
            // For binary content, use byte length as approximation
            if (fileContent.byteLength > maxCharacters) {
                throw new Error(`File content exceeds the maximum character limit (approx. ${fileContent.byteLength} bytes vs ${maxCharacters} allowed)`);
            }
            
            // Otherwise return the raw bytes
            return fileContent;
        }
    } catch (error) {
        console.error('[readWorkspaceFile] Error:', error);
        throw error;
    }
}

/**
 * Registers MCP file-related tools with the server
 * @param server MCP server instance
 * @param fileListingCallback Callback function for file listing operations
 */
export function registerFileTools(
    server: McpServer, 
    fileListingCallback: FileListingCallback
): void {
    // Add list_files tool
    server.tool(
        'list_files_code',
        'Use this tool to explore the directory structure of the VS Code workspace. It returns a list of files and directories at the specified path. When \'recursive\' is set to true, it will include all nested files and subdirectories. This tool is useful when you need to understand the project structure, find specific file types, or check if certain files exist before attempting to read or modify them. Start by exploring the root directory with path=\'.\' before diving into specific subdirectories.',
        {
            path: z.string().describe('The path to list files from'),
            recursive: z.boolean().optional().default(false).describe('Whether to list files recursively')
        },
        async ({ path, recursive = false }): Promise<CallToolResult> => {
            console.log(`[list_files] Tool called with path=${path}, recursive=${recursive}`);
            
            if (!fileListingCallback) {
                console.error('[list_files] File listing callback not set');
                throw new Error('File listing callback not set');
            }

            try {
                console.log('[list_files] Calling file listing callback');
                const files = await fileListingCallback(path, recursive);
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

    // Add read_file tool with proper nullable and default values
    server.tool(
        'read_file_code',
        'Use this tool to retrieve and analyze the contents of a file in the VS Code workspace. It returns the text content of the specified file path with optional encoding support. The tool enforces a character limit (default: 100,000) to prevent loading excessively large files. When working with code files, use this tool to understand existing implementations, check dependencies, or analyze patterns before suggesting edits. The default encoding is \'utf-8\', but you can specify other encodings as needed.',
        {
            path: z.string().describe('The path to the file to read'),
            encoding: z.string().optional().default('utf-8').describe('Optional encoding to convert the file content to a string'),
            maxCharacters: z.number().optional().default(DEFAULT_MAX_CHARACTERS).describe('Maximum character count (default: 100,000)')
        },
        async ({ path, encoding = null, maxCharacters = DEFAULT_MAX_CHARACTERS }): Promise<CallToolResult> => {
            console.log(`[read_file] Tool called with path=${path}, encoding=${encoding || 'none'}, maxCharacters=${maxCharacters}`);
            
            try {
                console.log('[read_file] Reading file');
                const content = await readWorkspaceFile(path, encoding, maxCharacters);
                
                let resultContent: string;
                if (content instanceof Uint8Array) {
                    // For binary data, convert to base64
                    const base64 = Buffer.from(content).toString('base64');
                    resultContent = `Binary file, base64 encoded: ${base64}`;
                    console.log(`[read_file] File read as binary, base64 length: ${base64.length}`);
                } else {
                    // For text data, return as is
                    resultContent = content;
                    console.log(`[read_file] File read as text, length: ${content.length} characters`);
                }
                
                const result: CallToolResult = {
                    content: [
                        {
                            type: 'text',
                            text: resultContent
                        }
                    ]
                };
                console.log('[read_file] Successfully completed');
                return result;
            } catch (error) {
                console.error('[read_file] Error in tool:', error);
                throw error;
            }
        }
    );
}