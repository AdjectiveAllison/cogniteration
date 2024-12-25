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
import { existsSync } from "fs";
import { readdir, stat, readFile } from "fs/promises";
import { tokenize, TokenizerModel, TOKENIZER_OPTIONS } from "./tokenizer.js";
import ignore from "ignore";

// Parse command line arguments
interface CliOptions {
	allowedDirectories: string[];
	tokenizer: TokenizerModel;
}

function parseCliArgs(): CliOptions {
	const args = process.argv.slice(2);
	const tokenizerFlag = "--tokenizer=";

	// Find tokenizer if specified
	const tokenizerArg = args.find(arg => arg.startsWith(tokenizerFlag));
	let tokenizer: TokenizerModel | undefined;
	let directories: string[];

	if (tokenizerArg) {
		const model = tokenizerArg.slice(tokenizerFlag.length) as TokenizerModel;
		if (!TOKENIZER_OPTIONS[model]) {
			console.error("Available tokenizer models:");
			Object.entries(TOKENIZER_OPTIONS).forEach(([key, desc]) => {
				console.error(`  ${key}: ${desc}`);
			});
			throw new Error(`Invalid tokenizer model: ${model}`);
		}
		tokenizer = model;
		directories = args.filter(arg => !arg.startsWith(tokenizerFlag));
	} else {
		directories = args;
	}

	if (directories.length === 0) {
		console.error("Usage: code-context [--tokenizer=<model>] <allowed-directory> [additional-directories...]");
		console.error("\nAvailable tokenizer models:");
		Object.entries(TOKENIZER_OPTIONS).forEach(([key, desc]) => {
			console.error(`  ${key}: ${desc}`);
		});
		process.exit(1);
	}

	return {
		allowedDirectories: directories,
		tokenizer: tokenizer || "Xenova/claude-tokenizer"
	};
}

const { allowedDirectories, tokenizer: selectedTokenizer } = parseCliArgs();

// Store allowed directories in normalized form 
const normalizedDirectories = allowedDirectories.map(dir =>
	path.normalize(path.resolve(dir))
);

// Schema definitions
const AnalyzeDirectorySchema = z.object({
	path: z.string(),
});

// Type definitions
interface FileInfo {
	path: string;
	tokenCount: number;
	lineCount: number;
}

interface AnalyzeDirectoryResponse {
	rootPath: string;
	files: FileInfo[];
	totalFiles: number;
	totalTokens: number;
}

// Common binary file extensions
const BINARY_FILE_PATTERNS = new Set([
	'.exe', '.dll', '.so', '.dylib', '.bin', '.obj', '.o',
	'.jpg', '.jpeg', '.png', '.gif', '.bmp', '.ico',
	'.mp3', '.wav', '.ogg',
	'.mp4', '.avi', '.mov',
	'.zip', '.tar', '.gz', '.7z', '.rar',
	'.pdf', '.doc', '.docx',
	'.pyc', '.pyo', '.pyd',
	'.class',
	'.lockb'
]);

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

// Check if a file might be binary based on extension
function isBinaryFile(filePath: string): boolean {
	const ext = path.extname(filePath).toLowerCase();
	return BINARY_FILE_PATTERNS.has(ext);
}

// Get token and line counts for a file
async function getFileCounts(filePath: string): Promise<{ lineCount: number; tokenCount: number }> {
	const content = await readFile(filePath, 'utf-8');
	const lines = content.split('\n');
	const { tokenCount } = await tokenize(content, selectedTokenizer);

	return {
		lineCount: lines.length,
		tokenCount
	};
}

// Read .gitignore file and return array of patterns
async function loadGitignore(dirPath: string): Promise<string[]> {
	const gitignorePath = path.join(dirPath, '.gitignore');
	try {
		if (existsSync(gitignorePath)) {
			const content = await readFile(gitignorePath, 'utf-8');
			// Split into lines and remove empty lines and comments
			return content
				.split('\n')
				.map(line => line.trim())
				.filter(line => line && !line.startsWith('#'));
		}
	} catch (error) {
		console.error(`Error reading .gitignore at ${dirPath}:`, error);
	}
	return [];
}

// Recursive directory traversal with nested .gitignore support
async function processDirectory(
	basePath: string,
	currentPath: string,
	parentPatterns: string[] = []
): Promise<FileInfo[]> {
	const files: FileInfo[] = [];

	// Get patterns from current directory's .gitignore
	const currentPatterns = await loadGitignore(currentPath);

	// Create ignore instance with all patterns
	const ig = ignore().add([...parentPatterns, ...currentPatterns]);

	const entries = await readdir(currentPath, { withFileTypes: true });

	for (const entry of entries) {
		const fullPath = path.join(currentPath, entry.name);
		const relativePath = path.relative(basePath, fullPath);

		if (ig.ignores(relativePath)) {
			continue;
		}

		if (entry.isDirectory()) {
			const subFiles = await processDirectory(
				basePath,
				fullPath,
				[...parentPatterns, ...currentPatterns]
			);
			files.push(...subFiles);
		} else if (entry.isFile() && !isBinaryFile(entry.name)) {
			try {
				const counts = await getFileCounts(fullPath);
				files.push({
					path: relativePath,
					...counts
				});
			} catch (error) {
				console.error(`Error processing file ${fullPath}:`, error);
				continue;
			}
		}
	}

	return files;
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
					"including token counts and line counts. Respects .gitignore rules " +
					"in each directory. Skips binary files and recursively processes " +
					"subdirectories.",
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
		const files = await processDirectory(validPath, validPath);
		const totalTokens = files.reduce((sum, file) => sum + file.tokenCount, 0);

		const response: AnalyzeDirectoryResponse = {
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
	console.error("Using tokenizer:", selectedTokenizer, `(${TOKENIZER_OPTIONS[selectedTokenizer]})`);
	console.error("Allowed directories:", normalizedDirectories);
}

runServer().catch((error) => {
	console.error("Fatal error running server:", error);
	process.exit(1);
});
