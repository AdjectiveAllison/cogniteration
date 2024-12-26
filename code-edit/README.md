# Code Edit MCP Server

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server for editing code files. When connected to an LLM through MCP, this tool provides the ability to modify files using either complete rewrites or targeted text replacements.

## Installation

```bash
# From npm (global)
npx @cogniteration/code-edit /path/to/directory

# Using bunx (no installation needed)
bunx @cogniteration/code-edit /path/to/directory
```

## Usage

Start the MCP server, specifying which directories it's allowed to access:

```bash
bunx @cogniteration/code-edit /path/to/directory [/additional/directories...]
```

### Tools

The server provides two main tools:

#### write_file
Creates a new file or completely overwrites an existing file:
```typescript
{
  "path": "/path/to/file.txt",
  "content": "New content for the file"
}
```

#### edit_file
Makes targeted replacements in a file:
```typescript
{
  "path": "/path/to/file.txt",
  "edits": [
    {
      "oldText": "text to replace",
      "newText": "replacement text"
    },
    // Can include multiple edits in one operation
    {
      "oldText": "another replacement",
      "newText": "new text"
    }
  ]
}
```

Both tools return a unified diff showing the changes made.

## Development

```bash
# Clone the repository
git clone https://github.com/AdjectiveAllison/cogniteration.git
cd cogniteration/code-edit

# Install dependencies
bun install

# Run locally
bun start

# Development with auto-reload
bun run dev
```

## License

MIT

## Contributing

Issues and pull requests welcome at [github.com/AdjectiveAllison/cogniteration](https://github.com/AdjectiveAllison/cogniteration).