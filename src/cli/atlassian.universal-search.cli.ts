import { Command } from 'commander';
import { Logger } from '../utils/logger.util.js';
import { handleCliError } from '../utils/error.util.js';
import atlassianUniversalSearchController from '../controllers/atlassian.universal-search.controller.js';
import { UniversalSearchToolArgsType } from '../tools/atlassian.universal-search.types.js';

function register(program: Command): void {
	const cliLogger = Logger.forContext(
		'cli/atlassian.universal-search.cli.ts',
		'register',
	);
	cliLogger.debug('Registering universal search CLI commands...');

	program
		.command('search-all')
		.description(
			'Search across pages, blog posts, spaces, attachments, and comments in one command.',
		)
		.requiredOption(
			'-q, --query <text>',
			'Text to search for across Confluence titles and full content. Required.',
		)
		.option(
			'--space-key <key>',
			'Restrict results (pages, blog posts, attachments, comments) to a specific space key.',
		)
		.option(
			'--labels <labels...>',
			'Require these labels on page and blog post results (all labels must match).',
		)
		.option(
			'--limit-per-type <number>',
			'Maximum number of results to return per content type (1-25). Defaults to 5.',
			'5',
		)
		.option(
			'--no-spaces',
			'Exclude spaces from the universal search results.',
		)
		.option(
			'--no-pages',
			'Exclude pages from the universal search results.',
		)
		.option(
			'--no-blog-posts',
			'Exclude blog posts from the universal search results.',
		)
		.option(
			'--no-attachments',
			'Exclude attachments from the universal search results.',
		)
		.option(
			'--no-comments',
			'Exclude comments from the universal search results.',
		)
		.action(async (options) => {
			const actionLogger = Logger.forContext(
				'cli/atlassian.universal-search.cli.ts',
				'searchAll',
			);
			try {
				actionLogger.debug('Processing command options:', options);

				const limitPerType = parseInt(options.limitPerType, 10);
				if (Number.isNaN(limitPerType) || limitPerType <= 0) {
					throw new Error(
						'Invalid --limit-per-type value: Must be a positive integer.',
					);
				}
				if (limitPerType > 25) {
					throw new Error(
						'Invalid --limit-per-type value: Maximum allowed is 25.',
					);
				}

				const searchOptions: UniversalSearchToolArgsType = {
					query: options.query,
					spaceKey: options.spaceKey,
					labels: options.labels,
					includeSpaces: options.spaces,
					includePages: options.pages,
					includeBlogPosts: options.blogPosts,
					includeAttachments: options.attachments,
					includeComments: options.comments,
					limitPerType,
				};

				actionLogger.debug(
					'Executing universal search with options:',
					searchOptions,
				);

				const result =
					await atlassianUniversalSearchController.search(
						searchOptions,
					);

				console.log(result.content);
			} catch (error) {
				actionLogger.error('Universal search failed:', error);
				handleCliError(error);
			}
		});
}

export default { register };
