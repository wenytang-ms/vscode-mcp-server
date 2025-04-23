# VS Code MCP Server

A Visual Studio Code extension that allows Claude and other MCP clients to code directly in VS Code! Inspired by [Serena](https://github.com/oraios/serena), but using VS Code's built-in capabilities. This is currently far simpler than Serena, but it works! Note that this extension uses the streamable HTTP API, not the SSE API, which is somewhat bleeding-edge.


## Claude Desktop Configuration

Claude Desktop can be configured to use this extension as an MCP server. To do this, your `claude_desktop_config.json` file should look like this:
```
{
  "mcpServers": {
    "vscode-mcp-server": {
        "command": "npx",
        "args": ["mcp-remote@next", "http://localhost:3000/mcp"]
    }

  }
}
```

I also like to use this extension in a Claude project, as it allows me to specify additional instructions for Claude. I find the following prompt to work well:
```
You are working on an existing codebase, which you can access using your tools. These code tools interact with a VS Code workspace.

Before running code tools that will make any modification to code, always present a comprehensive and detailed plan to the user, including your confidence level (out of 10). When planning, use your tools to explore the codebase so that you understand the context of the project. If you are not confident in your plan because you require more information, use your tools, such as web search, to look for this information or ask the user.

IMPORTANT: Only run code tools that will modify code after presenting such a plan to the user, and receiving explicit approval. Approval must be given each time; prior approval for a change does not imply that subsequent changes are approved.
```



This extension serves as a Model Context Protocol (MCP) server, exposing VS Code's filesystem and editing capabilities to MCP clients.

## Features

The VS Code MCP Server extension implements an MCP-compliant server that allows AI models and other MCP clients to:

- **List files and directories** in your VS Code workspace
- **Read file contents** with encoding support and size limits
- **Create new files** using VS Code's WorkspaceEdit API

This extension enables AI assistants and other tools to interact with your VS Code workspace through the standardized MCP protocol.

## How It Works

The extension creates an MCP server that:

1. Runs locally on a configurable port
2. Handles MCP protocol requests via HTTP
3. Exposes VS Code's functionality as MCP tools
4. Provides a status bar indicator showing server status

## Supported MCP Tools

### File Tools
- **list_files**: Lists files and directories in your workspace
  - Parameters:
    - `path`: The path to list files from
    - `recursive` (optional): Whether to list files recursively

- **read_file**: Reads file contents
  - Parameters:
    - `path`: The path to the file to read
    - `encoding` (optional): File encoding (default: utf-8)
    - `maxCharacters` (optional): Maximum character count (default: 100,000)

### Edit Tools
- **create_file**: Creates a new file using VS Code's WorkspaceEdit API
  - Parameters:
    - `path`: The path to the file to create
    - `content`: The content to write to the file
    - `overwrite` (optional): Whether to overwrite if the file exists (default: false)
    - `ignoreIfExists` (optional): Whether to ignore if the file exists (default: false)

## Caveats/TODO

Currently, only one workspace is supported. The extension also only works locally, to avoid exposing your VS Code instance to any network you may be connected to.

## Extension Settings

This extension contributes the following settings:

* `vscode-mcp-server.port`: The port number for the MCP server (default: 3000)

## Using with MCP Clients

To connect MCP clients to this server, configure them to use:
```
http://localhost:3000/mcp
```

## Contributing

Contributions are welcome! Feel free to submit issues or pull requests.

## License

[MIT](LICENSE)
