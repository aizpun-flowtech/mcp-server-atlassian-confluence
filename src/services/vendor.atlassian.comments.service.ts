/**
 * Service for interacting with Confluence comments API
 */

import { Logger } from '../utils/logger.util.js';
import {
	ATLASSIAN_SITE_REQUIRED_MESSAGE,
	fetchAtlassian,
	getAtlassianCredentials,
} from '../utils/transport.util.js';
import { createAuthMissingError } from '../utils/error.util.js';
import {
	ListPageCommentsParams,
	ListCommentsResponse,
} from './vendor.atlassian.comments.types.js';
import { PAGE_DEFAULTS } from '../utils/defaults.util.js';

// Create logger for this file
const logger = Logger.forContext(
	'services/vendor.atlassian.comments.service.ts',
);

/**
 * List comments for a specific Confluence page
 *
 * @param params - Parameters for the request
 * @returns Response containing the list of comments
 */
async function listPageComments(
	params: ListPageCommentsParams,
): Promise<ListCommentsResponse> {
	const {
		pageId,
		limit = PAGE_DEFAULTS.PAGE_SIZE,
		start = 0,
		bodyFormat = PAGE_DEFAULTS.BODY_FORMAT,
	} = params;

	const methodLogger = logger.forMethod('listPageComments');
	methodLogger.debug('Listing comments for page', {
		pageId,
		limit,
		start,
		bodyFormat,
	});

	// Get Atlassian credentials
	const credentials = getAtlassianCredentials();
	if (!credentials) {
		throw createAuthMissingError(ATLASSIAN_SITE_REQUIRED_MESSAGE);
	}

	// Set up query parameters
	const queryParams = new URLSearchParams({
		limit: limit.toString(),
		start: start.toString(),
	});

	// Different endpoints and parameters depending on whether we use REST API or v2 API
	// For now, we'll use the REST API which has better comment support
	// Expand both the body format and inline properties for inline comments
	const path = `/wiki/rest/api/content/${pageId}/child/comment?${queryParams.toString()}&expand=body.${bodyFormat},extensions.inlineProperties`;

	// Make the API request
	const response = await fetchAtlassian<ListCommentsResponse>(
		credentials,
		path,
	);

	methodLogger.debug('Retrieved comments', {
		count: response.results.length,
		total: response.size,
		pageId,
	});

	return response;
}

// Export service functions
export const atlassianCommentsService = {
	listPageComments,
};
