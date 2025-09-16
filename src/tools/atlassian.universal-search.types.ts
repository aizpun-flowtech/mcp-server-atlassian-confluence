import { z } from 'zod';

/**
 * Arguments for the universal Confluence search tool.
 */
const UniversalSearchToolArgs = z.object({
	query: z
		.string()
		.min(1)
		.describe(
			'Text to search for across Confluence pages, blog posts, spaces, attachments, and comments. Required.',
		),
	spaceKey: z
		.string()
		.optional()
		.describe(
			'Optional space key filter. When provided, only content within this space (pages, blog posts, comments, attachments) is returned.',
		),
	labels: z
		.array(z.string())
		.optional()
		.describe(
			'Optional labels to require on page and blog post results. All provided labels must be present on a result.',
		),
	includeSpaces: z
		.boolean()
		.optional()
		.describe(
			'Include Confluence spaces in the search results. Defaults to true.',
		),
	includePages: z
		.boolean()
		.optional()
		.describe(
			'Include Confluence pages in the search results. Defaults to true.',
		),
	includeBlogPosts: z
		.boolean()
		.optional()
		.describe(
			'Include Confluence blog posts in the search results. Defaults to true.',
		),
	includeAttachments: z
		.boolean()
		.optional()
		.describe(
			'Include Confluence attachments in the search results. Defaults to true.',
		),
	includeComments: z
		.boolean()
		.optional()
		.describe(
			'Include Confluence comments in the search results. Defaults to true.',
		),
	limitPerType: z
		.number()
		.int()
		.positive()
		.min(1)
		.max(25)
		.optional()
		.describe(
			'Maximum number of results to return for each selected content type (1-25). Defaults to 5.',
		),
});

type UniversalSearchToolArgsType = z.infer<typeof UniversalSearchToolArgs>;

export { UniversalSearchToolArgs, type UniversalSearchToolArgsType };
