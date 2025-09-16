import { Logger } from '../utils/logger.util.js';
import { handleControllerError } from '../utils/error-handler.util.js';
import { ControllerResponse } from '../types/common.types.js';
import atlassianSearchService from '../services/vendor.atlassian.search.service.js';
import { formatSearchResults } from './atlassian.search.formatter.js';
import {
	extractPaginationInfo,
	PaginationType,
} from '../utils/pagination.util.js';
import { DEFAULT_PAGE_SIZE, applyDefaults } from '../utils/defaults.util.js';
import { SearchParams } from '../services/vendor.atlassian.search.types.js';
import { SearchToolArgsType } from '../tools/atlassian.search.types.js';
import { buildErrorContext } from '../utils/error-handler.util.js';
import { ensureMcpError } from '../utils/error.util.js';
import { formatHeading, formatPagination } from '../utils/formatter.util.js';
import { escapeCqlValue } from '../utils/cql.util.js';

const controllerLogger = Logger.forContext(
	'controllers/atlassian.search.controller.ts',
);
controllerLogger.debug('Search controller initialized');

/**
 * Builds a CQL query string from provided options.
 * @param options SearchOptions containing filters.
 * @returns The constructed CQL string.
 */
function buildCqlQuery(options: SearchToolArgsType): string {
	const cqlParts: string[] = [];

	if (options.title) {
		cqlParts.push(`title ~ "${escapeCqlValue(options.title)}"`);
	}
	if (options.spaceKey) {
		cqlParts.push(`space = "${escapeCqlValue(options.spaceKey)}"`);
	}
	if (options.labels && options.labels.length > 0) {
		const escapedLabels = options.labels.map(escapeCqlValue);
		escapedLabels.forEach((label) => cqlParts.push(`label = "${label}"`));
	}
	if (options.contentType) {
		cqlParts.push(`type = ${options.contentType}`);
	}
	if (options.query) {
		cqlParts.push(`text ~ "${escapeCqlValue(options.query)}"`);
	}

	const generatedCql = cqlParts.join(' AND ');

	if (options.cql && options.cql.trim()) {
		if (generatedCql) {
			return `(${generatedCql}) AND (${options.cql})`;
		} else {
			return options.cql;
		}
	} else {
		return generatedCql || '';
	}
}

/**
 * Search Confluence content using CQL
 * @param options - Search options including CQL query and pagination
 * @returns Promise with formatted search results and pagination info
 * @throws Error if search operation fails
 */
async function search(
	options: SearchToolArgsType = {},
): Promise<ControllerResponse> {
	const methodLogger = Logger.forContext(
		'controllers/atlassian.search.controller.ts',
		'search',
	);
	methodLogger.debug('Searching Confluence with options:', options);

	try {
		const defaults: Partial<SearchToolArgsType> = {
			limit: DEFAULT_PAGE_SIZE,
		};
		const mergedOptions = applyDefaults<SearchToolArgsType>(
			options,
			defaults,
		);

		const finalCql = buildCqlQuery(mergedOptions);

		if (!finalCql || finalCql.trim() === '') {
			methodLogger.warn(
				'No CQL criteria provided for search. Returning empty.',
			);
			return {
				content:
					'Please provide search criteria (CQL, title, space, etc.).',
			};
		}

		methodLogger.debug(`Executing generated CQL: ${finalCql}`);

		const params: SearchParams = {
			cql: finalCql,
			limit: mergedOptions.limit,
			cursor: mergedOptions.cursor,
			excerpt: 'highlight',
			includeArchivedSpaces: false,
		};

		const searchData = await atlassianSearchService.search(params);

		methodLogger.debug(
			`Retrieved ${searchData.results.length} search results. Has more: ${searchData._links?.next ? 'yes' : 'no'}`,
		);

		const pagination = extractPaginationInfo(
			searchData,
			PaginationType.CURSOR,
			'Search',
		);

		// Format the search results
		const formattedResults = formatSearchResults(searchData.results);

		// Prepare the complete content string with CQL and pagination information
		let finalContent = '';

		// Add the executed CQL query if available
		if (finalCql && finalCql.trim()) {
			finalContent += `${formatHeading('Executed CQL Query', 3)}\n\`${finalCql}\`\n\n`;
		}

		// Add the formatted search results
		finalContent += formattedResults;

		// Add pagination information if available
		if (
			pagination &&
			(pagination.hasMore || pagination.count !== undefined)
		) {
			const paginationString = formatPagination(pagination);
			finalContent += '\n\n' + paginationString;
		}

		return {
			content: finalContent,
		};
	} catch (error) {
		const mcpError = ensureMcpError(error);
		// Check if it's a 400 error, potentially from bad CQL
		if (mcpError.statusCode === 400) {
			mcpError.message = `Search failed (Status 400 - Bad Request): ${mcpError.message}. This may be due to invalid CQL syntax. Please check your CQL query, ensure terms in text searches are quoted (e.g., text ~ "your terms"), and refer to the Confluence CQL documentation.`;
		}
		throw handleControllerError(
			mcpError, // Pass the potentially modified error
			buildErrorContext(
				'Search',
				'performing',
				'controllers/atlassian.search.controller.ts@search',
				{},
				{
					cql: options.cql || '',
					query: options.query || '',
					spaceKey: options.spaceKey,
					limit: options.limit,
					cursor: options.cursor,
				},
			),
		);
	}
}

export default { search };
