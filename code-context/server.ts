import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ToolSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import path from "path";
import { existsSync } from "fs";
import { readdir, stat } from "fs/promises";

// Command line argument parsing
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: code-context <allowed-directory> [additional-directories...]");
  process.exit(1);
}

// Store allowed directories in normalized form 
const allowedDirectories = args.map(dir => 
  path.normalize(path.resolve(dir))
);

// Schema definitions
const AnalyzeDirectorySchema = z.object({
  path: z.string(),
});

// Type to match our earlier definition
interface FileInfo {
  path: string;
  tokenCount: number;
  lineCount: number;
}

interface AnalyzeDirectoryResponse {
  isGitRepo: boolean;
  rootPath: string;
  files: FileInfo[];
  totalFiles: number;
  totalTokens: number;
}

// Security utilities
async function validatePath(requestedPath: string): Promise<string> {
  const absolute = path.isAbsolute(requestedPath)
    ? path.resolve(requestedPath)
    : path.resolve(process.cwd(), requestedPath);

  const normalized = path.normalize(absolute);

  // Check if path is within allowed directories
  const isAllowed = allowedDirectories.some(dir => normalized.startsWith(dir));
  if (!isAllowed) {
    throw new Error(`Access denied - path outside allowed directories: ${absolute}`);
  }

  return normalized;
}

// Basic git repository detection
function isGitRepository(dirPath: string): boolean {
  return existsSync(path.join(dirPath, '.git'));
}

// Temporary simple line counter until we integrate tokenizer
async function getFileCounts(filePath: string): Promise<{ lineCount: number; tokenCount: number }> {
  const content = await Bun.file(filePath).text();
  const lines = content.split('\n');
  // TODO: Replace with actual tokenizer implementation
  // For now, rough estimate: words * 1.3
  const tokens = Math.ceil(content.split(/\s+/).length * 1.3);
  return {
    lineCount: lines.length,
    tokenCount: tokens
  };
}

// Set up the server
const server = new Server(
  {
    name: "code-context-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "analyze_directory",
        description: 
          "Analyzes a directory to provide information about contained files, " +
          "including token counts and line counts. If the directory is a git " +
          "repository, it will respect .gitignore rules.",
        inputSchema: zodToJsonSchema(AnalyzeDirectorySchema) as z.infer<typeof ToolSchema>["inputSchema"],
      }
    ],
  };
});

// Implement analyze_directory tool
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    if (name !== "analyze_directory") {
      throw new Error(`Unknown tool: ${name}`);
    }

    const parsed = AnalyzeDirectorySchema.safeParse(args);
    if (!parsed.success) {
      throw new Error(`Invalid arguments: ${parsed.error}`);
    }

    const validPath = await validatePath(parsed.data.path);
    const isGitRepo = isGitRepository(validPath);

    const files: FileInfo[] = [];
    let totalTokens = 0;

    // Simple directory traversal for now
    // TODO: Add .gitignore processing for git repos
    const entries = await readdir(validPath, { withFileTypes: true });
    
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        const filePath = path.join(validPath, entry.name);
        const stats = await stat(filePath);
        
        if (stats.isFile()) {
          const counts = await getFileCounts(filePath);
          const fileInfo: FileInfo = {
            path: path.relative(validPath, filePath),
            ...counts
          };
          files.push(fileInfo);
          totalTokens += counts.tokenCount;
        }
      }
    }

    const response: AnalyzeDirectoryResponse = {
      isGitRepo,
      rootPath: validPath,
      files,
      totalFiles: files.length,
      totalTokens
    };

    return {
      content: [{ 
        type: "text", 
        text: JSON.stringify(response, null, 2)
      }],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${errorMessage}` }],
      isError: true,
    };
  }
});

// Start server
async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Code Context MCP Server running on stdio");
  console.error("Allowed directories:", allowedDirectories);
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});