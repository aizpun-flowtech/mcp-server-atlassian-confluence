import { createApiError, createAuthMissingError } from '../utils/error.util.js';
import { Logger } from '../utils/logger.util.js';
import {
	ATLASSIAN_SITE_REQUIRED_MESSAGE,
	fetchAtlassian,
	getAtlassianCredentials,
} from '../utils/transport.util.js';
import {
	PageDetailedSchema,
	PagesResponseSchema,
	ListPagesParams,
	GetPageByIdParams,
} from './vendor.atlassian.pages.types.js';
import { z } from 'zod';
import atlassianSearchService from './vendor.atlassian.search.service.js';
import atlassianSpacesService from './vendor.atlassian.spaces.service.js';

/**
 * Base API path for Confluence REST API v2
 * @see https://developer.atlassian.com/cloud/confluence/rest/v2/intro/
 * @constant {string}
 */
const API_PATH = '/wiki/api/v2';

/**
 * @namespace VendorAtlassianPagesService
 * @description Service for interacting with Confluence Pages API.
 * Provides methods for listing pages and retrieving page details.
 * Requires ATLASSIAN_SITE_NAME to be configured. Provide ATLASSIAN_USER_EMAIL and
 * ATLASSIAN_API_TOKEN for accessing non-public content.
 */

/**
 * Transform search results to pages format for hybrid title search
 * @param searchResults - Results from the search API
 * @returns Pages response in the expected format
 */
function transformSearchResultsToPagesFormat(searchResults: {
	results: Array<{
		content?: {
			type?: string;
			id?: string;
			title?: string;
			status?: string;
		};
		title?: string;
		space?: { id?: string };
		lastModified?: string;
		url?: string;
	}>;
	_links?: { next?: string; base?: string };
}): z.infer<typeof PagesResponseSchema> {
	const serviceLogger = Logger.forContext(
		'services/vendor.atlassian.pages.service.ts',
		'transformSearchResultsToPagesFormat',
	);

	// Filter to only include page-type results and transform to pages format
	const pageResults = searchResults.results
		.filter(
			(result) => result.content?.type === 'page' && result.content?.id,
		)
		.map((result) => ({
			id: result.content!.id!,
			status:
				(result.content!.status as
					| 'current'
					| 'archived'
					| 'trashed'
					| 'deleted'
					| 'draft'
					| 'historical') || 'current',
			title: result.content!.title || result.title || '',
			spaceId: result.space?.id?.toString() || '',
			version: {
				number: 1, // Search API doesn't provide version info
				authorId: '',
				message: '',
				createdAt: result.lastModified || new Date().toISOString(),
			},
			authorId: '',
			createdAt: result.lastModified || new Date().toISOString(),
			parentId: null,
			parentType: null,
			position: null,
			_links: {
				editui: result.url || '',
				webui: result.url || '',
				self: result.url || '',
				tinyui: result.url || '',
			},
		}));

	serviceLogger.debug(
		`Transformed ${pageResults.length} search results to pages format`,
	);

	return {
		results: pageResults,
		_links: {
			next: searchResults._links?.next,
			base: searchResults._links?.base || '',
		},
	};
}

/**
 * Try partial title search using CQL when exact match fails
 * @param params - Original list parameters
 * @returns Pages response from search results
 */
async function tryPartialTitleSearch(
	params: ListPagesParams,
): Promise<z.infer<typeof PagesResponseSchema>> {
	const serviceLogger = Logger.forContext(
		'services/vendor.atlassian.pages.service.ts',
		'tryPartialTitleSearch',
	);

	serviceLogger.debug('Attempting partial title search with CQL', {
		title: params.title,
		spaceIds: params.spaceId,
	});

	// Build CQL query for partial title matching
	const cqlParts: string[] = [];

	// Add title search with wildcard
	if (params.title) {
		// Use contains operator with wildcards for partial matching
		cqlParts.push(`title ~ "${params.title}*"`);
	}

	// Add space filtering if provided
	if (params.spaceId?.length) {
		try {
			// Get space keys from space IDs for CQL
			const spacesResponse = await atlassianSpacesService.list({
				ids: params.spaceId,
				limit: 100,
			});

			if (spacesResponse.results.length > 0) {
				const spaceKeys = spacesResponse.results.map(
					(space) => space.key,
				);
				const spaceConditions = spaceKeys
					.map((key) => `space = "${key}"`)
					.join(' OR ');
				cqlParts.push(`(${spaceConditions})`);

				serviceLogger.debug('Added space key filtering to CQL', {
					spaceKeys,
				});
			} else {
				serviceLogger.warn(
					'No spaces found for provided IDs, searching all spaces',
				);
			}
		} catch (error) {
			serviceLogger.warn(
				'Failed to lookup space keys, searching all spaces',
				error,
			);
		}
	}

	// Note: CQL search API doesn't support status filtering the same way
	// We'll rely on the fact that search typically returns current content by default

	// Only search for pages (not blogposts, folders, etc.)
	cqlParts.push('type = "page"');

	const cql = cqlParts.join(' AND ');

	serviceLogger.debug('Executing CQL query for partial title search', {
		cql,
	});

	try {
		// Use search service with our constructed CQL
		const searchResults = await atlassianSearchService.search({
			cql,
			limit: params.limit || 25,
			// Note: search API uses different pagination, we'll handle cursor separately
		});

		serviceLogger.debug(
			`Partial title search returned ${searchResults.results.length} results`,
		);

		// Transform search results to pages format
		return transformSearchResultsToPagesFormat(searchResults);
	} catch (error) {
		serviceLogger.error('Error in partial title search', error);
		// If search fails, return empty results rather than throwing
		return {
			results: [],
			_links: {
				base: '',
			},
		};
	}
}

/**
 * List Confluence pages with optional filtering and pagination
 *
 * Retrieves a list of pages from Confluence with support for various filters
 * and pagination options. Pages can be filtered by space, status, parent, etc.
 *
 * @async
 * @memberof VendorAtlassianPagesService
 * @param {ListPagesParams} params - Optional parameters to customize the request
 * @returns {Promise<PagesResponseType>} Promise containing the pages response with results and pagination info
 * @throws {Error} If Atlassian credentials are missing or API request fails
 * @example
 * // List pages from a specific space
 * const response = await list({
 *   spaceId: ['123'],
 *   status: ['current'],
 *   limit: 25
 * });
 */
async function list(
	params: ListPagesParams,
): Promise<z.infer<typeof PagesResponseSchema>> {
	const serviceLogger = Logger.forContext(
		'services/vendor.atlassian.pages.service.ts',
		'list',
	);
	serviceLogger.debug('Listing Confluence pages with params:', params);

	const credentials = getAtlassianCredentials();
	if (!credentials) {
		throw createAuthMissingError(ATLASSIAN_SITE_REQUIRED_MESSAGE);
	}

	// Build query parameters
	const queryParams = new URLSearchParams();

	// Content filters
	if (params.spaceId?.length) {
		queryParams.set('space-id', params.spaceId.join(','));
	}
	if (params.title) {
		queryParams.set('title', params.title);
	}
	if (params.status?.length) {
		queryParams.set('status', params.status.join(','));
	}
	if (params.query) {
		queryParams.set('query', params.query);
	}
	if (params.parentId) {
		queryParams.set('parent-id', params.parentId);
	}

	// Content format options
	if (params.bodyFormat) {
		queryParams.set('body-format', params.bodyFormat);
	}

	// Sort order
	if (params.sort) {
		queryParams.set('sort', params.sort);
	}

	// Pagination
	if (params.cursor) {
		queryParams.set('cursor', params.cursor);
	}
	if (params.limit) {
		queryParams.set('limit', params.limit.toString());
	}

	const queryString = queryParams.toString()
		? `?${queryParams.toString()}`
		: '';
	const path = `${API_PATH}/pages${queryString}`;

	serviceLogger.debug(`Sending request to: ${path}`);

	try {
		// Get the raw response data from the API
		const rawData = await fetchAtlassian<unknown>(credentials, path);

		// Validate the response data using the Zod schema
		try {
			const validatedData = PagesResponseSchema.parse(rawData);
			serviceLogger.debug(
				`Successfully validated pages list for ${validatedData.results.length} items`,
			);

			// HYBRID APPROACH: If we have a title filter and got no results, try partial search
			if (
				params.title &&
				validatedData.results.length === 0 &&
				!params.cursor // Only try on first page, not for pagination
			) {
				serviceLogger.info(
					`Exact title match failed for "${params.title}", attempting partial search`,
				);

				const partialResults = await tryPartialTitleSearch(params);

				if (partialResults.results.length > 0) {
					serviceLogger.info(
						`Partial title search found ${partialResults.results.length} results`,
					);
					return partialResults;
				} else {
					serviceLogger.debug(
						'Partial title search also returned no results',
					);
				}
			}

			return validatedData;
		} catch (validationError) {
			if (validationError instanceof z.ZodError) {
				serviceLogger.error(
					'API response validation failed:',
					validationError.format(),
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
		serviceLogger.error('Error fetching pages:', error);
		throw error; // Rethrow to be handled by the error handler util
	}
}

/**
 * Get detailed information about a specific Confluence page
 *
 * Retrieves comprehensive details about a single page, including content,
 * metadata, and optional components like labels, properties, and versions.
 *
 * @async
 * @memberof VendorAtlassianPagesService
 * @param {string} id - The ID of the page to retrieve
 * @param {GetPageByIdParams} params - Optional parameters to customize the response
 * @returns {Promise<PageDetailedSchemaType>} Promise containing the detailed page information
 * @throws {Error} If Atlassian credentials are missing or API request fails
 * @example
 * // Get page details with labels and versions
 * const page = await get('123', {
 *   bodyFormat: 'storage',
 *   includeLabels: true,
 *   includeVersions: true
 * });
 */
async function get(
	pageId: string,
	params: GetPageByIdParams = {},
): Promise<z.infer<typeof PageDetailedSchema>> {
	const serviceLogger = Logger.forContext(
		'services/vendor.atlassian.pages.service.ts',
		'get',
	);
	serviceLogger.debug(
		`Getting Confluence page with ID: ${pageId}, params:`,
		params,
	);

	const credentials = getAtlassianCredentials();
	if (!credentials) {
		throw createAuthMissingError(ATLASSIAN_SITE_REQUIRED_MESSAGE);
	}

	// Build query parameters
	const queryParams = new URLSearchParams();

	// Content format
	if (params.bodyFormat) {
		queryParams.set('body-format', params.bodyFormat);
	}

	// Version
	if (params.version) {
		queryParams.set('version', params.version.toString());
	}
	if (params.getDraft !== undefined) {
		queryParams.set('get-draft', params.getDraft.toString());
	}

	// Include flags
	if (params.includeAncestors !== undefined) {
		queryParams.set(
			'include-ancestors',
			params.includeAncestors.toString(),
		);
	}
	if (params.includeBody !== undefined) {
		queryParams.set('include-body', params.includeBody.toString());
	}
	if (params.includeChildTypes !== undefined) {
		queryParams.set(
			'include-child-types',
			params.includeChildTypes.toString(),
		);
	}
	if (params.includeCollaborators !== undefined) {
		queryParams.set(
			'include-collaborators',
			params.includeCollaborators.toString(),
		);
	}
	if (params.includeLabels !== undefined) {
		queryParams.set('include-labels', params.includeLabels.toString());
	}
	if (params.includeOperations !== undefined) {
		queryParams.set(
			'include-operations',
			params.includeOperations.toString(),
		);
	}
	if (params.includeVersion !== undefined) {
		queryParams.set('include-version', params.includeVersion.toString());
	}
	if (params.includeWebresources !== undefined) {
		queryParams.set(
			'include-webresources',
			params.includeWebresources.toString(),
		);
	}

	const queryString = queryParams.toString()
		? `?${queryParams.toString()}`
		: '';
	const path = `${API_PATH}/pages/${pageId}${queryString}`;

	serviceLogger.debug(`Sending request to: ${path}`);

	try {
		// Get the raw response data from the API
		const rawData = await fetchAtlassian<unknown>(credentials, path);

		// Validate the response data using the Zod schema
		try {
			const validatedData = PageDetailedSchema.parse(rawData);
			serviceLogger.debug(
				`Successfully validated page details for ID: ${pageId}`,
			);
			return validatedData;
		} catch (validationError) {
			if (validationError instanceof z.ZodError) {
				serviceLogger.error(
					'API response validation failed:',
					validationError.format(),
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
		serviceLogger.error('Error fetching page details:', error);
		throw error; // Rethrow to be handled by the error handler util
	}
}

export default { list, get };
