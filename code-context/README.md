# Code Context MCP Server

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server for analyzing codebases with accurate token counting. When connected to an LLM through MCP, this tool provides accurate token counts and file analysis features.

## Installation

```bash
# From npm (global)
npx @cogniteration/code-context /path/to/directory

# Using bunx (no installation needed)
bunx @cogniteration/code-context /path/to/directory
```

## Usage

Start the MCP server, specifying which directories it's allowed to access:

```bash
bunx @cogniteration/code-context /path/to/directory [/additional/directories...]
```

### Tokenizer Selection

By default, the Claude tokenizer is used. You can specify a different tokenizer model:

```bash
bunx @cogniteration/code-context --tokenizer=Xenova/gpt-4 /path/to/directory
```

Available tokenizers:
- `Xenova/claude-tokenizer` (default)
- `Xenova/gpt-4` - GPT-4 / GPT-3.5-turbo
- `Xenova/mistral-tokenizer-v3` - Mistral v3
- And more (use `--tokenizer=invalid` to see full list)

## Development

```bash
# Clone the repository
git clone https://github.com/AdjectiveAllison/cogniteration.git
cd cogniteration/code-context

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
