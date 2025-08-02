import { Logger } from '../utils/logger.util.js';
import { handleControllerError } from '../utils/error-handler.util.js';
import { createApiError, ensureMcpError } from '../utils/error.util.js';
import { ControllerResponse } from '../types/common.types.js';
import {
	formatPageDetails,
	formatPagesList,
} from './atlassian.pages.formatter.js';
import atlassianPagesService from '../services/vendor.atlassian.pages.service.js';
import atlassianSpacesService from '../services/vendor.atlassian.spaces.service.js';
import { atlassianCommentsController } from './atlassian.comments.controller.js';
import {
	DEFAULT_PAGE_SIZE,
	PAGE_DEFAULTS,
	applyDefaults,
} from '../utils/defaults.util.js';
import {
	ListPagesParams,
	GetPageByIdParams,
	BodyFormat,
} from '../services/vendor.atlassian.pages.types.js';
import {
	extractPaginationInfo,
	PaginationType,
} from '../utils/pagination.util.js';
import {
	ListPagesToolArgsType,
	GetPageToolArgsType,
} from '../tools/atlassian.pages.types.js';
import { adfToMarkdown } from '../utils/adf.util.js';
import { formatPagination } from '../utils/formatter.util.js';

/**
 * Controller for managing Confluence pages.
 * Provides functionality for listing pages and retrieving page details.
 */

// Create a contextualized logger for this file
const controllerLogger = Logger.forContext(
	'controllers/atlassian.pages.controller.ts',
);

// Log controller initialization
controllerLogger.debug('Confluence pages controller initialized');

// Simple in-memory cache for space key to ID mapping
const spaceKeyCache: Record<string, { id: string; timestamp: number }> = {};
const CACHE_TTL = 3600000; // 1 hour in milliseconds

/**
 * List pages from Confluence with filtering options
 * @param options - Options for filtering pages
 * @param options.spaceIds - Filter by space ID(s)
 * @param options.spaceKeys - Filter by space key(s) - user-friendly alternative to spaceId
 * @param options.query - Filter by text in title, content or labels
 * @param options.status - Filter by page status
 * @param options.sort - Sort order for results
 * @param options.limit - Maximum number of pages to return
 * @param options.cursor - Pagination cursor for subsequent requests
 * @returns Promise with formatted pages list content including pagination information
 * @throws Error if page listing fails
 */
async function list(
	options: ListPagesToolArgsType = {},
): Promise<ControllerResponse> {
	const methodLogger = Logger.forContext(
		'controllers/atlassian.pages.controller.ts',
		'list',
	);
	methodLogger.debug('Listing Confluence pages with options:', options);
	methodLogger.info(
		`Fetching Confluence pages (limit: ${options.limit || DEFAULT_PAGE_SIZE})`,
	);

	try {
		const defaults: Partial<ListPagesToolArgsType> = {
			limit: DEFAULT_PAGE_SIZE,
			sort: '-modified-date',
			status: ['current'],
		};
		const mergedOptions = applyDefaults<ListPagesToolArgsType>(
			options,
			defaults,
		);

		let resolvedSpaceIds = mergedOptions.spaceIds || []; // Use renamed option

		// Handle space key resolution if provided
		if (mergedOptions.spaceKeys && mergedOptions.spaceKeys.length > 0) {
			// Use renamed option
			methodLogger.debug(
				`Resolving ${mergedOptions.spaceKeys.length} space keys to IDs`, // Use renamed option
			);

			const currentTime = Date.now();
			const keysToResolve: string[] = [];
			const currentResolvedIds: string[] = []; // IDs resolved in this specific call

			// Check cache first
			mergedOptions.spaceKeys.forEach((key) => {
				// Use renamed option
				const cached = spaceKeyCache[key];
				if (cached && currentTime - cached.timestamp < CACHE_TTL) {
					methodLogger.debug(
						`Using cached ID for space key "${key}": ${cached.id}`,
					);
					currentResolvedIds.push(cached.id);
				} else {
					keysToResolve.push(key);
				}
			});

			if (keysToResolve.length > 10) {
				methodLogger.warn(
					`Resolving ${keysToResolve.length} space keys - this may impact performance`,
				);
			}

			if (keysToResolve.length > 0) {
				try {
					const spacesResponse = await atlassianSpacesService.list({
						keys: keysToResolve,
						limit: 100,
					});

					if (
						spacesResponse.results &&
						spacesResponse.results.length > 0
					) {
						// Explicitly type 'space' parameter
						spacesResponse.results.forEach(
							(space: { key: string; id: string }) => {
								spaceKeyCache[space.key] = {
									id: space.id,
									timestamp: currentTime,
								};
								currentResolvedIds.push(space.id);
							},
						);

						// Explicitly type 'space' parameter
						const resolvedKeys = spacesResponse.results.map(
							(space: { key: string }) => space.key,
						);
						const failedKeys = keysToResolve.filter(
							(key) => !resolvedKeys.includes(key),
						);
						if (failedKeys.length > 0) {
							methodLogger.warn(
								`Could not resolve space keys: ${failedKeys.join(', ')}`,
							);
						}
					}
				} catch (resolveError: unknown) {
					// Type error explicitly
					const error = ensureMcpError(resolveError); // Ensure it's an McpError
					methodLogger.error(
						'Failed to resolve space keys',
						error.message,
					);
					if (
						resolvedSpaceIds.length === 0 &&
						currentResolvedIds.length === 0
					) {
						// Throw only if no direct IDs and no keys resolved successfully
						throw createApiError(
							`Failed to resolve any provided space keys: ${error.message}`,
							400,
							error, // Pass the original error
						);
					}
					// Otherwise log warning and continue
					methodLogger.warn(
						'Proceeding with directly provided IDs and any cached/resolved keys, despite resolution error.',
					);
				}
			}

			// Combine resolved IDs (from this call) with any directly provided IDs
			resolvedSpaceIds = [
				...new Set([...resolvedSpaceIds, ...currentResolvedIds]),
			];
		}

		// Final check: If keys/IDs were provided but none resolved, return empty.
		if (
			(mergedOptions.spaceKeys || mergedOptions.spaceIds) && // Use renamed options
			resolvedSpaceIds.length === 0
		) {
			methodLogger.warn(
				'No valid space IDs found to query. Returning empty.',
			);
			return {
				content:
					'No pages found. Specified space keys/IDs are invalid or inaccessible.',
			};
		}

		// Map controller options to service parameters
		const params: ListPagesParams = {
			// Keep conditional spread for optional params
			...(mergedOptions.title && { title: mergedOptions.title }),
			...(mergedOptions.status && { status: mergedOptions.status }),
			...(mergedOptions.sort && { sort: mergedOptions.sort }),
			...(mergedOptions.limit !== undefined && {
				limit: mergedOptions.limit,
			}),
			...(mergedOptions.cursor && { cursor: mergedOptions.cursor }),
			...(mergedOptions.parentId && { parentId: mergedOptions.parentId }),
		};

		// Explicitly add spaceId if resolvedSpaceIds has items
		if (resolvedSpaceIds && resolvedSpaceIds.length > 0) {
			params.spaceId = resolvedSpaceIds;
		}

		methodLogger.debug('Using service params (initial):', params);

		// Add extra detailed log right before the service call
		methodLogger.debug(
			`Final check before service call - params.spaceId: ${JSON.stringify(params.spaceId)}`,
		);
		methodLogger.debug(
			'Final check before service call - full params object:',
			params,
		);

		const pagesData = await atlassianPagesService.list(params);

		methodLogger.debug(
			`Retrieved ${pagesData.results.length} pages. Has more: ${pagesData._links?.next ? 'yes' : 'no'}`,
		);

		const pagination = extractPaginationInfo(
			pagesData,
			PaginationType.CURSOR,
			'Page',
		);

		// Pass the results array and baseUrl to the formatter
		const baseUrl = pagesData._links?.base || '';
		const formattedPages = formatPagesList(pagesData.results, baseUrl);

		// Create the complete content string by appending the pagination information
		let finalContent = formattedPages;

		// Only add pagination information if it exists and contains relevant information
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
		throw handleControllerError(error, {
			entityType: 'Pages',
			operation: 'listing',
			source: 'controllers/atlassian.pages.controller.ts@list',
		});
	}
}

/**
 * Get details of a specific Confluence page
 * @param args - Object containing the ID of the page to retrieve
 * @param args.pageId - The ID of the page
 * @returns Promise with formatted page details content
 * @throws Error if page retrieval fails
 */
async function get(args: GetPageToolArgsType): Promise<ControllerResponse> {
	const { pageId } = args;
	const methodLogger = Logger.forContext(
		'controllers/atlassian.pages.controller.ts',
		'get',
	);
	methodLogger.debug(`Getting Confluence page with ID: ${pageId}...`);

	try {
		// Map controller options to service parameters
		const params: GetPageByIdParams = {
			bodyFormat: PAGE_DEFAULTS.BODY_FORMAT as BodyFormat,
			includeLabels: PAGE_DEFAULTS.INCLUDE_LABELS,
			includeOperations: PAGE_DEFAULTS.INCLUDE_PROPERTIES, // Changed to correct parameter
			includeWebresources: PAGE_DEFAULTS.INCLUDE_WEBRESOURCES,
			includeCollaborators: PAGE_DEFAULTS.INCLUDE_COLLABORATORS,
			includeVersion: PAGE_DEFAULTS.INCLUDE_VERSION,
		};

		methodLogger.debug('Using service params:', params);

		// Get page data from the API
		const pageData = await atlassianPagesService.get(pageId, params);

		// Log only key information instead of the entire response
		methodLogger.debug(
			`Retrieved page: ${pageData.title} (${pageData.id})`,
		);

		// Convert ADF to Markdown before formatting
		let markdownBody = '*Content format not supported or unavailable*';
		if (pageData.body?.atlas_doc_format?.value) {
			try {
				markdownBody = adfToMarkdown(
					pageData.body.atlas_doc_format.value,
				);
				methodLogger.debug(
					'Successfully converted ADF to Markdown for page body',
				);
			} catch (conversionError) {
				methodLogger.error(
					'ADF to Markdown conversion failed for page body',
					conversionError,
				);
				// Keep the default error message for markdownBody
			}
		} else {
			methodLogger.warn('No ADF content available for page', { pageId });
		}

		// Fetch recent comments for this page
		let commentsSummary = null;
		try {
			methodLogger.debug(
				`Fetching recent comments for page ID: ${pageId}`,
			);
			commentsSummary =
				await atlassianCommentsController.listPageComments({
					pageId,
					limit: 3, // Get just a few recent comments
					bodyFormat: 'atlas_doc_format', // Get the comments in ADF format
				});

			methodLogger.debug(`Retrieved comments summary for page.`);
		} catch (error) {
			methodLogger.warn(
				`Failed to fetch comments: ${error instanceof Error ? error.message : String(error)}`,
			);
			// Continue even if we couldn't get the comments
		}

		// Format the page data for display, passing the converted markdown body and comments
		const formattedPage = formatPageDetails(
			pageData,
			markdownBody,
			commentsSummary,
		);

		return {
			content: formattedPage,
		};
	} catch (error) {
		throw handleControllerError(error, {
			entityType: 'Page',
			entityId: pageId,
			operation: 'retrieving',
			source: 'controllers/atlassian.pages.controller.ts@get',
		});
	}
}

export default { list, get };
