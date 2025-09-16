import { Logger } from '../utils/logger.util.js';
import {
	handleControllerError,
	buildErrorContext,
} from '../utils/error-handler.util.js';
import { ControllerResponse } from '../types/common.types.js';
import atlassianSearchService from '../services/vendor.atlassian.search.service.js';
import {
	SearchParams,
	SearchResultType,
} from '../services/vendor.atlassian.search.types.js';
import { escapeCqlValue } from '../utils/cql.util.js';
import {
	formatUniversalSearchResults,
	UniversalSearchSectionKey,
} from './atlassian.universal-search.formatter.js';
import { UniversalSearchToolArgsType } from '../tools/atlassian.universal-search.types.js';
import { ensureMcpError } from '../utils/error.util.js';

const controllerLogger = Logger.forContext(
	'controllers/atlassian.universal-search.controller.ts',
);

const DEFAULT_LIMIT_PER_TYPE = 5;

type NormalizedUniversalOptions = {
	query: string;
	spaceKey?: string;
	labels?: string[];
	includeSpaces: boolean;
	includePages: boolean;
	includeBlogPosts: boolean;
	includeAttachments: boolean;
	includeComments: boolean;
	limitPerType: number;
};

const SECTION_TO_CQL_TYPE: Record<UniversalSearchSectionKey, string> = {
	spaces: 'space',
	pages: 'page',
	blogPosts: 'blogpost',
	attachments: 'attachment',
	comments: 'comment',
};

function normalizeOptions(
	options: UniversalSearchToolArgsType,
): NormalizedUniversalOptions {
	const trimmedQuery = options.query?.trim() ?? '';

	return {
		query: trimmedQuery,
		spaceKey: options.spaceKey?.trim() || undefined,
		labels:
			options.labels
				?.map((label) => label.trim())
				.filter((label) => label.length > 0) || undefined,
		includeSpaces:
			options.includeSpaces !== undefined ? options.includeSpaces : true,
		includePages:
			options.includePages !== undefined ? options.includePages : true,
		includeBlogPosts:
			options.includeBlogPosts !== undefined
				? options.includeBlogPosts
				: true,
		includeAttachments:
			options.includeAttachments !== undefined
				? options.includeAttachments
				: true,
		includeComments:
			options.includeComments !== undefined
				? options.includeComments
				: true,
		limitPerType:
			options.limitPerType !== undefined
				? Math.min(Math.max(options.limitPerType, 1), 25)
				: DEFAULT_LIMIT_PER_TYPE,
	} satisfies NormalizedUniversalOptions;
}

function buildTypeSpecificCql(
	type: UniversalSearchSectionKey,
	options: NormalizedUniversalOptions,
): string {
	const clauses: string[] = [];

	clauses.push(`type = ${SECTION_TO_CQL_TYPE[type]}`);
	clauses.push(`text ~ "${escapeCqlValue(options.query)}"`);

	if (type !== 'spaces' && options.spaceKey) {
		clauses.push(`space = "${escapeCqlValue(options.spaceKey)}"`);
	}

	if (options.labels && (type === 'pages' || type === 'blogPosts')) {
		for (const label of options.labels) {
			clauses.push(`label = "${escapeCqlValue(label)}"`);
		}
	}

	return clauses.join(' AND ');
}

async function executeSearchForType(
	type: UniversalSearchSectionKey,
	options: NormalizedUniversalOptions,
): Promise<SearchResultType[]> {
	const cql = buildTypeSpecificCql(type, options);

	controllerLogger.debug(
		`Executing universal search for ${type} with CQL: ${cql}`,
	);

	const params: SearchParams = {
		cql,
		limit: options.limitPerType,
		excerpt: 'highlight',
		includeArchivedSpaces: false,
	};

	const response = await atlassianSearchService.search(params);

	return response.results || [];
}

async function search(
	options: UniversalSearchToolArgsType,
): Promise<ControllerResponse> {
	const methodLogger = controllerLogger.forMethod('search');
	methodLogger.debug('Received universal search options:', options);

	if (!options.query || options.query.trim().length === 0) {
		methodLogger.warn('Universal search called without a query string.');
		return {
			content:
				'Please provide a search query (for example: `--query "design"`).',
		};
	}

	let normalizedOptions: NormalizedUniversalOptions | null = null;

	try {
		normalizedOptions = normalizeOptions(options);

		const includedTypes = (
			[
				['spaces', normalizedOptions.includeSpaces],
				['pages', normalizedOptions.includePages],
				['blogPosts', normalizedOptions.includeBlogPosts],
				['attachments', normalizedOptions.includeAttachments],
				['comments', normalizedOptions.includeComments],
			] as Array<[UniversalSearchSectionKey, boolean]>
		)
			.filter(([, include]) => include)
			.map(([key]) => key);

		if (includedTypes.length === 0) {
			methodLogger.warn(
				'Universal search called with no content types enabled.',
			);
			return {
				content:
					'No content types selected. Enable at least one type (pages, spaces, blog posts, attachments, or comments).',
			};
		}

		const searchPromises = includedTypes.map(async (type) => {
			const results = await executeSearchForType(
				type,
				normalizedOptions!,
			);
			return [type, results] as const;
		});

		const resolvedResults = await Promise.all(searchPromises);

		const resultsByType: Record<
			UniversalSearchSectionKey,
			SearchResultType[]
		> = {
			spaces: [],
			pages: [],
			blogPosts: [],
			attachments: [],
			comments: [],
		};

		for (const [type, results] of resolvedResults) {
			resultsByType[type] = results;
		}

		const content = formatUniversalSearchResults({
			query: normalizedOptions.query,
			spaceKey: normalizedOptions.spaceKey,
			labels: normalizedOptions.labels,
			limitPerType: normalizedOptions.limitPerType,
			includedTypes,
			results: resultsByType,
		});

		return { content };
	} catch (error) {
		const mcpError = ensureMcpError(error);
		if (mcpError.statusCode === 400) {
			mcpError.message = `Universal search failed (Status 400 - Bad Request): ${mcpError.message}. This may indicate invalid CQL generated from the provided filters. Double-check the query text and filters.`;
		}

		throw handleControllerError(
			mcpError,
			buildErrorContext(
				'Universal search',
				'performing',
				'controllers/atlassian.universal-search.controller.ts@search',
				{
					query: options.query,
				},
				{
					limitPerType:
						normalizedOptions?.limitPerType ??
						options.limitPerType ??
						DEFAULT_LIMIT_PER_TYPE,
					spaceKey: normalizedOptions?.spaceKey || options.spaceKey,
				},
			),
		);
	}
}

export default { search };
