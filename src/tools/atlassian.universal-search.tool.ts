import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { Logger } from '../utils/logger.util.js';
import { formatErrorForMcpTool } from '../utils/error.util.js';
import atlassianUniversalSearchController from '../controllers/atlassian.universal-search.controller.js';
import {
	UniversalSearchToolArgs,
	UniversalSearchToolArgsType,
} from './atlassian.universal-search.types.js';

async function universalSearch(args: Record<string, unknown>) {
	const methodLogger = Logger.forContext(
		'tools/atlassian.universal-search.tool.ts',
		'universalSearch',
	);
	methodLogger.debug('Universal search tool called with args:', args);

	try {
		const result = await atlassianUniversalSearchController.search(
			args as UniversalSearchToolArgsType,
		);

		return {
			content: [
				{
					type: 'text' as const,
					text: result.content,
				},
			],
		};
	} catch (error) {
		methodLogger.error('Universal search tool failed:', error);
		return formatErrorForMcpTool(error);
	}
}

function registerTools(server: McpServer) {
	const toolLogger = Logger.forContext(
		'tools/atlassian.universal-search.tool.ts',
		'registerTools',
	);
	toolLogger.debug('Registering universal search MCP tool...');

	const schema = z.object({
		query: UniversalSearchToolArgs.shape.query,
		spaceKey: UniversalSearchToolArgs.shape.spaceKey,
		labels: UniversalSearchToolArgs.shape.labels,
		includeSpaces: UniversalSearchToolArgs.shape.includeSpaces,
		includePages: UniversalSearchToolArgs.shape.includePages,
		includeBlogPosts: UniversalSearchToolArgs.shape.includeBlogPosts,
		includeAttachments: UniversalSearchToolArgs.shape.includeAttachments,
		includeComments: UniversalSearchToolArgs.shape.includeComments,
		limitPerType: UniversalSearchToolArgs.shape.limitPerType,
	});

	server.tool(
		'conf_search_all',
		`Performs a single search across multiple Confluence content types (pages, blog posts, spaces, attachments, comments).
- Provide a required \`query\` to search text content, titles, and excerpts.
- Optional \`spaceKey\` filters content results (pages, blog posts, attachments, comments) to one space.
- Optional \`labels\` require all provided labels on page/blog post results.
- Enable/disable categories with \`include*\` flags or rely on defaults (all enabled).
- Uses highlight excerpts and returns Markdown grouped by content type with result counts and tips.`,
		schema.shape,
		async (args: Record<string, unknown>) => universalSearch(args),
	);

	toolLogger.debug('Universal search MCP tool registered successfully');
}

export default { registerTools };
