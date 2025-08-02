import { z } from 'zod';
import type { PageSortOrder } from '../services/vendor.atlassian.pages.types.js';

/**
 * Base pagination arguments for all tools
 */
const PaginationArgs = {
	limit: z
		.number()
		.int()
		.positive()
		.min(1)
		.max(250)
		.optional()
		.describe(
			'Maximum number of items to return (1-250). Controls the response size. Defaults to 25 if omitted. The Confluence API caps results at 250 items per request.',
		),

	cursor: z
		.string()
		.optional()
		.describe(
			'Pagination cursor for retrieving the next set of results. Obtain this opaque string from the metadata.pagination.nextCursor of a previous response when more results are available. Confluence uses cursor-based pagination rather than offset-based pagination.',
		),
};

/**
 * Arguments for listing Confluence pages
 * Matches the controller's ListPagesOptions interface
 */
const ListPagesToolArgs = z.object({
	spaceIds: z
		.array(z.string())
		.optional()
		.describe(
			'Optional: Numeric Space IDs to filter by. Either use this OR spaceKeys, not both together. If both are provided, only spaceIds will be used.',
		),

	spaceKeys: z
		.array(z.string())
		.optional()
		.describe(
			'Optional: Space Keys (e.g., "DEV") to filter by. Either use this OR spaceIds, not both together. If both are provided, only spaceIds will be used. Preferred for usability as keys are more human-readable than IDs.',
		),

	parentId: z
		.string()
		.optional()
		.describe('Optional: Parent page ID to filter for child pages only.'),

	title: z
		.string()
		.optional()
		.describe(
			'Filter pages by title with SMART MATCHING. First tries exact match, then automatically falls back to partial matching if no exact results found. For example, "Balance" will find "Balance Reconciliation System - Documentation Summary". For full-text content search or advanced CQL queries, use the `conf_search` tool instead.',
		),

	status: z
		.array(
			z.enum(['current', 'trashed', 'deleted', 'archived', 'historical']),
		)
		.optional()
		.describe(
			'Optional: Filter pages by status. Options: "current" (published), "trashed", "deleted", "archived", "historical" (previous versions). Defaults to ["current"] if not specified. Provide as an array to include multiple statuses.',
		),

	...PaginationArgs,

	sort: z
		.enum([
			'id',
			'-id',
			'created-date',
			'-created-date',
			'modified-date',
			'-modified-date',
			'title',
			'-title',
		] as [PageSortOrder, ...PageSortOrder[]])
		.optional()
		.describe(
			'Optional: Property to sort pages by. Default is "-modified-date" (most recently modified first). The "-" prefix indicates descending order. Valid values: "id", "-id", "created-date", "-created-date", "modified-date", "-modified-date", "title", "-title".',
		),
});

type ListPagesToolArgsType = z.infer<typeof ListPagesToolArgs>;

/**
 * Arguments for getting a specific Confluence page
 * Matches the controller's get function signature
 */
const GetPageToolArgs = z.object({
	pageId: z
		.string()
		.describe(
			'The numeric ID of the Confluence page to retrieve (e.g., "456789"). This is required and must be a valid page ID from your Confluence instance. The page content will be returned in Markdown format for easy reading.',
		),
});

type GetPageToolArgsType = z.infer<typeof GetPageToolArgs>;

export {
	ListPagesToolArgs,
	type ListPagesToolArgsType,
	GetPageToolArgs,
	type GetPageToolArgsType,
};
