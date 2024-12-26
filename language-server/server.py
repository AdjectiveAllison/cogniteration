#!/usr/bin/env python

import argparse
import asyncio
import logging
import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Optional

from pydantic import BaseModel, Field
from mcp.server import Server, stdio_server
from mcp.server.models import InitializationOptions
from mcp.types import (
    Tool,
    ListToolsRequest,
    ListToolsResult,
    CallToolRequest,
    CallToolResult,
    TextContent,
    ServerCapabilities,
    ToolsCapability,
    ServerResult,
)
import pylspclient


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stderr)]
)
logger = logging.getLogger("language-server")


# Models
class LanguageConfig(BaseModel):
    """Configuration for a language server"""
    command: List[str] = Field(..., description="Command to start the LSP server")
    extensions: List[str] = Field(..., description="File extensions this server handles")
    language_id: str = Field(..., description="LSP language identifier")


class Diagnostic(BaseModel):
    """LSP diagnostic information"""
    message: str
    severity: int = Field(..., description="1=Error, 2=Warning, 3=Info, 4=Hint")
    line: int = Field(..., ge=0)
    column: int = Field(..., ge=0)
    source: Optional[str] = None


class ValidationResult(BaseModel):
    """Result of file validation"""
    file_path: str
    diagnostics: List[Diagnostic] = []
    error: Optional[str] = None


# Language server configurations
LANGUAGE_CONFIGS: Dict[str, LanguageConfig] = {
    # TypeScript/JavaScript
    ".ts": LanguageConfig(
        command=["typescript-language-server", "--stdio"],
        extensions=[".ts", ".tsx"],
        language_id="typescript"
    ),
    ".tsx": LanguageConfig(
        command=["typescript-language-server", "--stdio"],
        extensions=[".ts", ".tsx"],
        language_id="typescriptreact"
    ),
    ".js": LanguageConfig(
        command=["typescript-language-server", "--stdio"],
        extensions=[".js", ".jsx"],
        language_id="javascript"
    ),
    ".jsx": LanguageConfig(
        command=["typescript-language-server", "--stdio"],
        extensions=[".js", ".jsx"],
        language_id="javascriptreact"
    ),
    # Python
    ".py": LanguageConfig(
        command=["pylsp"],
        extensions=[".py"],
        language_id="python"
    ),
    # Zig
    ".zig": LanguageConfig(
        command=["zls"],
        extensions=[".zig"],
        language_id="zig"
    ),
}


class LanguageServer:
    """Manages LSP server lifecycle and communication"""
    def __init__(self, allowed_dirs: List[Path]):
        self.allowed_dirs = [p.resolve() for p in allowed_dirs]
        logger.info("Allowed directories: %s", self.allowed_dirs)

    def validate_path(self, file_path: str) -> Path:
        """Validate and resolve a file path"""
        path = Path(file_path).resolve()
        
        # Check if path is within allowed directories
        if not any(
            any(parent == allowed_dir for parent in path.parents)
            for allowed_dir in self.allowed_dirs
        ):
            raise ValueError(f"Path not in allowed directories: {path}")
            
        if not path.exists():
            raise ValueError(f"File does not exist: {path}")
            
        return path

    async def validate_file(self, file_path: str) -> ValidationResult:
        """Validate a file using the appropriate LSP server"""
        try:
            path = self.validate_path(file_path)
            ext = path.suffix.lower()
            
            if ext not in LANGUAGE_CONFIGS:
                return ValidationResult(
                    file_path=file_path,
                    error=f"Unsupported file type: {ext}"
                )
            
            config = LANGUAGE_CONFIGS[ext]
            logger.info("Validating %s using %s", path, config.command)
            
            # TODO: Implement LSP validation
            # For now just return empty result
            return ValidationResult(file_path=file_path)
            
        except Exception as e:
            logger.error("Validation failed: %s", e)
            return ValidationResult(
                file_path=file_path,
                error=str(e)
            )


def create_server(language_server: LanguageServer) -> Server:
    """Create and configure the MCP server"""
    server = Server("language-server")
    
    async def handle_list_tools(request: ListToolsRequest) -> ServerResult:
        """List available tools"""
        return ServerResult(root=ListToolsResult(
            tools=[
                Tool(
                    name="validate",
                    description="Validate a file using LSP and return diagnostics",
                    inputSchema={
                        "type": "object",
                        "properties": {"file_path": {"type": "string"}},
                        "required": ["file_path"],
                    }
                )
            ]
        ))

    async def handle_call_tool(request: CallToolRequest) -> ServerResult:
        """Handle tool invocations"""
        if request.params.name != "validate":
            raise ValueError(f"Unknown tool: {request.params.name}")

        if not request.params.arguments or "file_path" not in request.params.arguments:
            raise ValueError("Missing required argument: file_path")

        result = await language_server.validate_file(request.params.arguments["file_path"])

        # Format results into readable text
        text = f"Validation results for {result.file_path}:\n"
        
        if result.error:
            text += f"Error: {result.error}\n"
        elif not result.diagnostics:
            text += "No issues found\n"
        else:
            text += "\nDiagnostics:\n"
            for diag in result.diagnostics:
                severity = ["Error", "Warning", "Info", "Hint"][diag.severity - 1]
                text += f"• {severity} at line {diag.line}, column {diag.column}: {diag.message}\n"
                if diag.source:
                    text += f"  Source: {diag.source}\n"
        
        return ServerResult(root=CallToolResult(
            content=[TextContent(type="text", text=text)]
        ))

    server.request_handlers[ListToolsRequest] = handle_list_tools
    server.request_handlers[CallToolRequest] = handle_call_tool
    
    return server


async def main():
    """Run the server"""
    parser = argparse.ArgumentParser(description="LSP-based validation server")
    parser.add_argument(
        "allowed_directories",
        nargs="+",
        type=Path,
        help="Directories that can be accessed for validation"
    )
    
    args = parser.parse_args()
    language_server = LanguageServer(args.allowed_directories)
    server = create_server(language_server)
    
    logger.info("Starting language-server")
    logger.info("Supported languages: %s", list(LANGUAGE_CONFIGS.keys()))
    
    async with stdio_server() as (read, write):
        await server.run(
            read,
            write,
            InitializationOptions(
                server_name="language-server",
                server_version="0.1.0",
                capabilities=ServerCapabilities(
                    tools=ToolsCapability(listChanged=False)
                ),
            ),
        )


if __name__ == "__main__":
    asyncio.run(main())