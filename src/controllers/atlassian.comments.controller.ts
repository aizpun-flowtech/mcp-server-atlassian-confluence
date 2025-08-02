/**
 * Controller for Confluence comments
 */

import { Logger } from '../utils/logger.util.js';
import { handleControllerError } from '../utils/error-handler.util.js';
import { atlassianCommentsService } from '../services/vendor.atlassian.comments.service.js';
import {
	extractPaginationInfo,
	PaginationType,
} from '../utils/pagination.util.js';
import { ControllerResponse } from '../types/common.types.js';
import { formatCommentsList } from './atlassian.comments.formatter.js';
import { formatInlineCommentsList } from './atlassian.inline-comments.formatter.js';
import { DEFAULT_PAGE_SIZE } from '../utils/defaults.util.js';
import { adfToMarkdown } from '../utils/adf.util.js';
import {
	CommentData,
	InlineProperties,
} from '../services/vendor.atlassian.comments.types.js';
import { formatPagination } from '../utils/formatter.util.js';

// Create logger for this controller
const logger = Logger.forContext(
	'controllers/atlassian.comments.controller.ts',
);

/**
 * Interface for list comments options
 */
interface ListPageCommentsOptions {
	/**
	 * The ID of the page to get comments for
	 */
	pageId: string;

	/**
	 * Maximum number of results to return
	 */
	limit?: number;

	/**
	 * Starting point for pagination
	 */
	start?: number;

	/**
	 * Body format (storage, view, atlas_doc_format)
	 */
	bodyFormat?: 'storage' | 'view' | 'atlas_doc_format';
}

/**
 * Interface for list inline comments options
 */
interface ListInlineCommentsOptions {
	/**
	 * The ID of the page to get inline comments for
	 */
	pageId: string;

	/**
	 * Include resolved inline comments
	 */
	includeResolved?: boolean;

	/**
	 * Sort order for inline comments
	 */
	sortBy?: 'created' | 'position';

	/**
	 * Maximum number of results to return
	 */
	limit?: number;

	/**
	 * Starting point for pagination
	 */
	start?: number;

	/**
	 * Body format (storage, view, atlas_doc_format)
	 */
	bodyFormat?: 'storage' | 'view' | 'atlas_doc_format';
}

/**
 * Extended interface for a comment with converted markdown content
 */
interface CommentWithContext extends CommentData {
	/**
	 * Converted markdown body
	 */
	convertedMarkdownBody: string;

	/**
	 * Highlighted text that the comment refers to (for inline comments)
	 */
	highlightedText?: string;
}

/**
 * List comments for a specific Confluence page
 *
 * @param options - Options for listing comments
 * @returns Controller response with formatted comments and pagination info
 */
async function listPageComments(
	options: ListPageCommentsOptions,
): Promise<ControllerResponse> {
	const methodLogger = logger.forMethod('listPageComments');
	try {
		// Apply defaults and prepare service parameters
		const {
			pageId,
			limit = DEFAULT_PAGE_SIZE,
			start = 0,
			bodyFormat = 'atlas_doc_format', // Explicitly define default
		} = options;

		methodLogger.debug('Listing page comments', {
			pageId,
			limit,
			start,
			bodyFormat,
		});

		// Call the service to get comments data
		const commentsData = await atlassianCommentsService.listPageComments({
			pageId,
			limit,
			start,
			bodyFormat,
		});

		// Extract pagination information
		const pagination = extractPaginationInfo(
			commentsData,
			PaginationType.OFFSET,
			'Comment',
		);

		// Convert ADF content to Markdown and extract highlighted text for inline comments
		const convertedComments: CommentWithContext[] =
			commentsData.results.map((comment) => {
				let markdownBody =
					'*Content format not supported or unavailable*';

				// Convert comment body from ADF to Markdown
				if (comment.body?.atlas_doc_format?.value) {
					try {
						markdownBody = adfToMarkdown(
							comment.body.atlas_doc_format.value,
						);
						methodLogger.debug(
							`Successfully converted ADF to Markdown for comment ${comment.id}`,
						);
					} catch (conversionError) {
						methodLogger.error(
							`ADF conversion failed for comment ${comment.id}`,
							conversionError,
						);
						// Keep default error message
					}
				} else {
					methodLogger.warn(
						`No ADF content available for comment ${comment.id}`,
					);
				}

				// Extract the highlighted text for inline comments
				let highlightedText: string | undefined = undefined;
				if (
					comment.extensions?.location === 'inline' &&
					comment.extensions.inlineProperties
				) {
					// Safely access inlineProperties fields with type checking
					const props = comment.extensions
						.inlineProperties as InlineProperties;

					// Try different properties that might contain the highlighted text
					// Some Confluence versions use different property names
					highlightedText =
						props.originalSelection || props.textContext;

					// If not found in standard properties, check for custom properties
					if (!highlightedText && 'selectionText' in props) {
						highlightedText = String(props.selectionText || '');
					}

					if (highlightedText) {
						methodLogger.debug(
							`Found highlighted text for comment ${comment.id}: ${highlightedText.substring(0, 50)}${highlightedText.length > 50 ? '...' : ''}`,
						);
					} else {
						methodLogger.warn(
							`No highlighted text found for inline comment ${comment.id}`,
						);
					}
				}

				// Return comment with added context
				return {
					...comment,
					convertedMarkdownBody: markdownBody,
					highlightedText,
				};
			});

		// Format the comments for display
		const baseUrl = commentsData._links?.base || '';
		const formattedContent = formatCommentsList(
			convertedComments,
			pageId,
			baseUrl,
		);

		// Create the final content with pagination information included
		let finalContent = formattedContent;

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
		// Handle errors
		throw handleControllerError(error, {
			entityType: 'Comment',
			operation: 'list',
			source: 'controllers/atlassian.comments.controller.ts@listPageComments',
			additionalInfo: { pageId: options.pageId },
		});
	}
}

/**
 * List inline comments only for a specific Confluence page
 *
 * @param options - Options for listing inline comments
 * @returns Controller response with formatted inline comments and pagination info
 */
async function listInlineComments(
	options: ListInlineCommentsOptions,
): Promise<ControllerResponse> {
	const methodLogger = logger.forMethod('listInlineComments');
	try {
		// Apply defaults and prepare service parameters
		const {
			pageId,
			includeResolved = false,
			sortBy = 'position',
			limit = DEFAULT_PAGE_SIZE,
			start = 0,
			bodyFormat = 'atlas_doc_format',
		} = options;

		methodLogger.debug('Listing inline comments for page', {
			pageId,
			includeResolved,
			sortBy,
			limit,
			start,
			bodyFormat,
		});

		// Get all comments first with a higher limit to ensure we capture inline comments
		// since we'll filter them locally
		const allCommentsData = await atlassianCommentsService.listPageComments(
			{
				pageId,
				limit: 250, // Get more comments to filter inline ones
				start: 0, // Always start from beginning for inline filtering
				bodyFormat,
			},
		);

		methodLogger.debug('Retrieved all comments for filtering', {
			totalComments: allCommentsData.results.length,
			pageId,
		});

		// Filter for inline comments only
		const inlineCommentsRaw = allCommentsData.results.filter((comment) => {
			const isInline = comment.extensions?.location === 'inline';

			// Apply resolved filter if needed
			if (!includeResolved && comment.status !== 'current') {
				return false;
			}

			return isInline;
		});

		methodLogger.debug('Filtered inline comments', {
			inlineCount: inlineCommentsRaw.length,
			totalCount: allCommentsData.results.length,
			includeResolved,
		});

		// Convert ADF content to Markdown and extract highlighted text for inline comments
		const convertedComments: CommentWithContext[] = inlineCommentsRaw.map(
			(comment) => {
				let markdownBody =
					'*Content format not supported or unavailable*';

				// Convert comment body from ADF to Markdown
				if (comment.body?.atlas_doc_format?.value) {
					try {
						markdownBody = adfToMarkdown(
							comment.body.atlas_doc_format.value,
						);
						methodLogger.debug(
							`Successfully converted ADF to Markdown for inline comment ${comment.id}`,
						);
					} catch (conversionError) {
						methodLogger.error(
							`ADF conversion failed for inline comment ${comment.id}`,
							conversionError,
						);
						// Keep default error message
					}
				} else {
					methodLogger.warn(
						`No ADF content available for inline comment ${comment.id}`,
					);
				}

				// Extract the highlighted text for inline comments
				let highlightedText: string | undefined = undefined;
				if (comment.extensions?.inlineProperties) {
					// Safely access inlineProperties fields with type checking
					const props = comment.extensions
						.inlineProperties as InlineProperties;

					// Try different properties that might contain the highlighted text
					highlightedText =
						props.originalSelection || props.textContext;

					// If not found in standard properties, check for custom properties
					if (!highlightedText && 'selectionText' in props) {
						highlightedText = String(props.selectionText || '');
					}

					if (highlightedText) {
						methodLogger.debug(
							`Found highlighted text for inline comment ${comment.id}: ${highlightedText.substring(0, 50)}${highlightedText.length > 50 ? '...' : ''}`,
						);
					} else {
						methodLogger.warn(
							`No highlighted text found for inline comment ${comment.id}`,
						);
					}
				}

				// Return comment with added context
				return {
					...comment,
					convertedMarkdownBody: markdownBody,
					highlightedText,
				};
			},
		);

		// Sort inline comments by requested order
		if (sortBy === 'position') {
			convertedComments.sort((a, b) => {
				// Sort by marker position or container ID if available
				const aPos = a.extensions?.inlineProperties?.markerRef || a.id;
				const bPos = b.extensions?.inlineProperties?.markerRef || b.id;
				return String(aPos).localeCompare(String(bPos));
			});
		} else if (sortBy === 'created') {
			// Sort by ID as a proxy for creation order (newer IDs = later created)
			convertedComments.sort((a, b) => a.id.localeCompare(b.id));
		}

		// Apply pagination after filtering and sorting
		const paginatedComments = convertedComments.slice(start, start + limit);

		methodLogger.debug('Applied pagination to inline comments', {
			totalInline: convertedComments.length,
			start,
			limit,
			returned: paginatedComments.length,
		});

		// Format the inline comments for display
		const baseUrl = allCommentsData._links?.base || '';
		const formattedContent = formatInlineCommentsList(
			paginatedComments,
			pageId,
			baseUrl,
			convertedComments.length,
			start,
			limit,
		);

		return {
			content: formattedContent,
		};
	} catch (error) {
		// Handle errors
		throw handleControllerError(error, {
			entityType: 'InlineComment',
			operation: 'list',
			source: 'controllers/atlassian.comments.controller.ts@listInlineComments',
			additionalInfo: { pageId: options.pageId },
		});
	}
}

// Export controller functions
export const atlassianCommentsController = {
	listPageComments,
	listInlineComments,
};
