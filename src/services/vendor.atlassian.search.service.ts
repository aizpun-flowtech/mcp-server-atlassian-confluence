import { createApiError, createAuthMissingError } from '../utils/error.util.js';
import { Logger } from '../utils/logger.util.js';
import {
	ATLASSIAN_SITE_REQUIRED_MESSAGE,
	getAtlassianCredentials,
} from '../utils/transport.util.js';
import {
	SearchParams,
	SearchResponseSchema,
	SearchResponseType,
} from './vendor.atlassian.search.types.js';
import { z } from 'zod';

/**
 * Base API path for Confluence REST API v1 (using v1 instead of v2 to bypass the generic-content-type bug)
 * @see https://developer.atlassian.com/cloud/confluence/rest/v1/api-group-search/
 * @constant {string}
 */
const API_PATH = '/wiki/rest/api';

/**
 * Interface for Confluence V1 API search response
 */
interface V1SearchResult {
	content?: {
		id?: string;
		type?: string;
		status?: string;
		title?: string;
		[key: string]: unknown;
	};
	space?: {
		id?: number;
		key?: string;
		name?: string;
		[key: string]: unknown;
	};
	title?: string;
	excerpt?: string;
	url?: string;
	resultGlobalContainer?: {
		title?: string;
		displayUrl?: string;
		[key: string]: unknown;
	};
	breadcrumbs?: Array<unknown>;
	entityType?: string;
	iconCssClass?: string;
	lastModified?: string;
	friendlyLastModified?: string;
	score?: number;
	[key: string]: unknown;
}

/**
 * Interface for Confluence V1 API search response
 */
interface V1SearchResponse {
	results?: V1SearchResult[];
	start?: number;
	limit?: number;
	size?: number;
	totalSize?: number;
	cqlQuery?: string;
	searchDuration?: number;
	_links?: {
		base?: string;
		context?: string;
		next?: string;
		self?: string;
		[key: string]: unknown;
	};
	[key: string]: unknown;
}

/**
 * Search Confluence content using CQL
 *
 * @param {SearchParams} params - Parameters for the search query
 * @returns {Promise<SearchResponseType>} Promise containing the search results
 * @throws {Error} If Atlassian credentials are missing or API request fails
 */
async function search(params: SearchParams): Promise<SearchResponseType> {
	const serviceLogger = Logger.forContext(
		'services/vendor.atlassian.search.service.ts',
		'search',
	);
	serviceLogger.debug('Searching Confluence with params:', params);

	const credentials = getAtlassianCredentials();
	if (!credentials) {
		throw createAuthMissingError(ATLASSIAN_SITE_REQUIRED_MESSAGE);
	}

	// Build request parameters
	const queryParams: Record<string, string> = {};

	// Required CQL query
	queryParams.cql = params.cql;

	// Pagination
	// v1 API uses start/limit instead of cursor
	if (params.limit) {
		queryParams.limit = params.limit.toString();
	}

	// The v1 API parameters are slightly different, but we can map most of them
	if (params.includeTotalSize !== undefined) {
		// v1 API always includes total size, no need for this parameter
	}
	if (params.includeArchivedSpaces !== undefined) {
		// No direct equivalent in v1 API
	}
	if (params.excerpt) {
		queryParams.excerpt = params.excerpt;
	}

	// Manually build query string to avoid URLSearchParams handling
	const queryString = Object.entries(queryParams)
		.map(
			([key, value]) =>
				`${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
		)
		.join('&');

	try {
		// Construct the full URL for the API call using the v1 search endpoint
		const baseUrl = `https://${credentials.siteName}.atlassian.net`;
		const url = `${baseUrl}${API_PATH}/search${queryString ? `?${queryString}` : ''}`;

		// For debugging
		serviceLogger.debug(`Making direct fetch to v1 API endpoint: ${url}`);

		// Build headers and include authentication when available
		const headers: Record<string, string> = {
			Accept: 'application/json',
			'Content-Type': 'application/json',
		};

		if (credentials.userEmail && credentials.apiToken) {
			headers.Authorization = `Basic ${Buffer.from(
				`${credentials.userEmail}:${credentials.apiToken}`,
			).toString('base64')}`;
		}

		// Make direct fetch call
		const response = await fetch(url, {
			method: 'GET',
			headers,
		});

		// Log the response status for debugging
		serviceLogger.debug(`API response status: ${response.status}`);

		// Check for error response
		if (!response.ok) {
			const errorText = await response.text();
			serviceLogger.error(`API error response: ${errorText}`);
			throw createApiError(
				`API request failed with status ${response.status}`,
				response.status,
				errorText,
			);
		}

		// Parse the JSON response
		const v1Data = (await response.json()) as V1SearchResponse;

		serviceLogger.debug(
			`Successfully retrieved ${v1Data.results?.length || 0} search results from v1 API`,
		);

		// The v1 API has a slightly different format, transform it to match the expected type
		const transformedData = {
			results: (v1Data.results || []).map((result: V1SearchResult) => {
				return {
					content: result.content || {},
					space: result.space || {},
					title: result.title || '',
					excerpt: result.excerpt || '',
					url: result.url || '',
					resultGlobalContainer: result.resultGlobalContainer || {},
					breadcrumbs: result.breadcrumbs || [],
					entityType: result.entityType || '',
					iconCssClass: result.iconCssClass || '',
					lastModified: result.lastModified || '',
					friendlyLastModified: result.friendlyLastModified || '',
					score: result.score || 0,
				};
			}),
			_links: v1Data._links || {},
			total: v1Data.totalSize,
		};

		// Validate the transformed data using our schema
		try {
			const validatedData = SearchResponseSchema.parse(transformedData);
			serviceLogger.debug(
				`Successfully validated search results for ${validatedData.results.length} items`,
			);
			return validatedData;
		} catch (validationError) {
			if (validationError instanceof z.ZodError) {
				serviceLogger.error(
					'API response validation failed:',
					validationError.format(),
				);

				// Log the data structure for debugging
				serviceLogger.debug(
					'Transformed data structure:',
					JSON.stringify(transformedData, null, 2).substring(
						0,
						1000,
					) + '...',
				);

				throw createApiError(
					`API response validation failed: ${validationError.message}`,
					500,
					validationError,
				);
			}
			// Re-throw other errors
			throw validationError;
		}
	} catch (error) {
		serviceLogger.error('Error searching content:', error);
		throw error; // Rethrow to be handled by the error handler util
	}
}

export default { search };
