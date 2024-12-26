#!/usr/bin/env bun
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
	ToolSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import * as path from "path";
import { readFile, writeFile } from "fs/promises";
import { createPatch } from 'diff';

// Parse command line arguments
interface CliOptions {
	allowedDirectories: string[];
}

function parseCliArgs(): CliOptions {
	const args = process.argv.slice(2);

	if (args.length === 0) {
		console.error("Usage: code-edit <allowed-directory> [additional-directories...]");
		process.exit(1);
	}

	return {
		allowedDirectories: args
	};
}

const { allowedDirectories } = parseCliArgs();

// Store allowed directories in normalized form 
const normalizedDirectories = allowedDirectories.map(dir =>
	path.normalize(path.resolve(dir))
);

// Schema definitions
const WriteFileSchema = z.object({
	path: z.string(),
	content: z.string()
});

const EditFileSchema = z.object({
	path: z.string(),
	oldText: z.string().describe('Text to search for - must match exactly'),
	newText: z.string().describe('Text to replace with')
});

// Security utilities
async function validatePath(requestedPath: string): Promise<string> {
	const absolute = path.isAbsolute(requestedPath)
		? path.resolve(requestedPath)
		: path.resolve(process.cwd(), requestedPath);

	const normalized = path.normalize(absolute);

	// Check if path is within allowed directories
	const isAllowed = normalizedDirectories.some(dir => normalized.startsWith(dir));
	if (!isAllowed) {
		throw new Error(`Access denied - path outside allowed directories: ${absolute}`);
	}

	return normalized;
}

// Helper function to create a unified diff
function createUnifiedDiff(originalContent: string, newContent: string, filePath: string): string {
	// Normalize line endings to \n for consistent diffing
	const normalizedOriginal = originalContent.replace(/\r\n/g, '\n');
	const normalizedNew = newContent.replace(/\r\n/g, '\n');

	return createPatch(
		filePath,
		normalizedOriginal,
		normalizedNew,
		'original',
		'modified'
	);
}

// Set up the server
const server = new Server(
	{
		name: "code-edit-mcp",
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
				name: "write_file",
				description:
					"Create a new file or completely overwrite an existing file with new content. " +
					"The file path must be within the allowed directories. Shows a diff only if " +
					"the file exists and the content changes.",
				inputSchema: zodToJsonSchema(WriteFileSchema) as z.infer<typeof ToolSchema>["inputSchema"],
			},
			{
				name: "edit_file",
				description:
					"Make a targeted replacement in a file by specifying the exact text to find and replace. " +
					"The file path must be within the allowed directories. " +
					"Returns a unified diff showing the changes made.",
				inputSchema: zodToJsonSchema(EditFileSchema) as z.infer<typeof ToolSchema>["inputSchema"],
			}
		],
	};
});

// Implement the tools
server.setRequestHandler(CallToolRequestSchema, async (request) => {
	try {
		const { name, arguments: args } = request.params;

		switch (name) {
			case "write_file": {
				const parsed = WriteFileSchema.safeParse(args);
				if (!parsed.success) {
					throw new Error(`Invalid arguments: ${parsed.error}`);
				}

				const validPath = await validatePath(parsed.data.path);

				// Try to read existing content
				let originalContent: string | null = null;
				try {
					originalContent = await readFile(validPath, 'utf-8');
				} catch (error) {
					if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
						throw error;
					}
					// File doesn't exist - that's fine for write_file
				}

				// Write the new content
				await writeFile(validPath, parsed.data.content, 'utf-8');

				// Only show diff if file existed and content changed
				if (originalContent !== null && originalContent !== parsed.data.content) {
					const diff = createUnifiedDiff(originalContent, parsed.data.content, parsed.data.path);
					return {
						content: [{
							type: "text",
							text: diff
						}],
					};
				}

				// For new files or unchanged content, just return success message
				return {
					content: [{
						type: "text",
						text: originalContent === null
							? `Created new file: ${parsed.data.path}`
							: `File unchanged: ${parsed.data.path}`
					}],
				};
			}

			case "edit_file": {
				const parsed = EditFileSchema.safeParse(args);
				if (!parsed.success) {
					throw new Error(`Invalid arguments: ${parsed.error}`);
				}

				const validPath = await validatePath(parsed.data.path);

				// Read the file content
				const originalContent = await readFile(validPath, 'utf-8');

				// Normalize line endings in the content and search text
				const normalizedContent = originalContent.replace(/\r\n/g, '\n');
				const normalizedOld = parsed.data.oldText.replace(/\r\n/g, '\n');

				if (!normalizedContent.includes(normalizedOld)) {
					throw new Error(`Could not find text to replace: ${parsed.data.oldText}`);
				}

				// Apply the edit
				const newContent = normalizedContent.replace(normalizedOld, parsed.data.newText);

				// Write the modified content back
				await writeFile(validPath, newContent, 'utf-8');

				// Generate diff
				const diff = createUnifiedDiff(originalContent, newContent, parsed.data.path);

				return {
					content: [{
						type: "text",
						text: diff
					}],
				};
			}

			default:
				throw new Error(`Unknown tool: ${name}`);
		}
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
	console.error("Code Edit MCP Server running on stdio");
	console.error("Allowed directories:", normalizedDirectories);
}

runServer().catch((error) => {
	console.error("Fatal error running server:", error);
	process.exit(1);
});
