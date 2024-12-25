# Code Context MCP Server

## WIP, THIS README IS LLM GENERATED

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server implementation that enables language models to analyze codebases with accurate token counting. Built with Bun and TypeScript, this tool makes it easy for LLMs to understand the structure and content of code repositories.

## Features

- **Directory Analysis**: Recursively analyze directories to get token and line counts for all text files
- **Smart Filtering**: 
  - Respects `.gitignore` rules at any directory level
  - Skips binary files automatically
  - Handles nested directory structures
- **Accurate Token Counting**: 
  - Uses actual tokenizer models for precise token counts
  - Supports multiple tokenizer models including Claude, GPT-4, Mistral, and more
  - Efficient tokenizer caching
- **Security**: 
  - Path validation and sandboxing
  - Explicit directory allowlist
  - Safe handling of symbolic links

## Installation

```bash
# Clone the repository
git clone https://github.com/AdjectiveAllison/cogniteration.git
cd cogniteration/code-context

# Install dependencies
bun install

# Build
bun run build
```

## Usage

Start the server by specifying which directories it's allowed to access:

```bash
code-context /path/to/directory [/additional/directories...]
```

### Tokenizer Selection

You can specify which tokenizer model to use:

```bash
code-context --tokenizer=Xenova/claude-tokenizer /path/to/directory
```

Available tokenizer models:
- `Xenova/claude-tokenizer` (default) - Claude
- `Xenova/gpt-4` - GPT-4 / GPT-3.5-turbo
- `Xenova/mistral-tokenizer-v3` - Mistral v3
- And more (use `--tokenizer=invalid` to see full list)

## MCP Integration

The server exposes one tool:

### analyze_directory

Analyzes a directory to provide token and line counts for all text files. Respects .gitignore rules and skips binary files.

**Input:**
```typescript
{
  path: string  // Path to analyze
}
```

**Output:**
```typescript
{
  rootPath: string,      // Absolute path to root
  files: Array<{        // Array of analyzed files
    path: string,       // Path relative to root
    tokenCount: number, // Number of tokens in file
    lineCount: number   // Number of lines in file
  }>,
  totalFiles: number,   // Total number of files processed
  totalTokens: number   // Sum of all file tokens
}
```

## Example Response

```json
{
  "rootPath": "/path/to/project",
  "files": [
    {
      "path": "src/main.ts",
      "tokenCount": 1234,
      "lineCount": 100
    },
    {
      "path": "README.md",
      "tokenCount": 567,
      "lineCount": 50
    }
  ],
  "totalFiles": 2,
  "totalTokens": 1801
}
```

## Security Considerations

- The server can only access directories specified in the command line arguments
- All file paths are validated against the allowed directory list
- Symlinks are resolved and checked against allowed directories
- Binary files are automatically skipped
- No file writing capabilities

## Development

```bash
# Run in development mode with hot reload
bun run dev

# Format code
bun run format

# Type check
bun run check-types
```

## License

MIT

## Contributing

Contributions welcome! Please feel free to submit a Pull Request.
