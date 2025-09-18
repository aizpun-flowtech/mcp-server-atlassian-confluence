/**
 * Formatter for Confluence comments
 */

import { CommentData } from '../services/vendor.atlassian.comments.types.js';
import {
	formatDate,
	formatHeading,
	formatBulletList,
	formatSeparator,
	formatNumberedList,
} from '../utils/formatter.util.js';
import {
	ensureAbsoluteConfluenceUrl,
	resolveConfluenceBaseUrl,
} from '../utils/url.util.js';

/**
 * Extended CommentData interface with the converted markdown body and highlighted text
 */
interface CommentWithMarkdown extends CommentData {
	convertedMarkdownBody: string;
	highlightedText?: string;
}

/**
 * Format a list of comments for display
 *
 * @param commentsData - Raw comments data from the API with pre-converted markdown content
 * @param pageId - ID of the page the comments belong to
 * @param baseUrl - Base URL for constructing comment links
 * @returns Formatted string with comments information in markdown format
 */
export function formatCommentsList(
	commentsData: CommentWithMarkdown[],
	pageId: string,
	baseUrl: string = '',
): string {
	const resolvedBaseUrl = resolveConfluenceBaseUrl(baseUrl);

	if (!commentsData || commentsData.length === 0) {
		return (
			'No comments found for this page.' +
			'\n\n' +
			formatSeparator() +
			'\n' +
			`*Information retrieved at: ${formatDate(new Date())}*`
		);
	}

	const lines: string[] = [formatHeading('Page Comments', 1), ''];

	// Format each comment with its details
	const formattedList = formatNumberedList(
		commentsData,
		(comment, _index) => {
			const itemLines: string[] = [];

			// Basic information
			const title = comment.title.replace(/^Re: /, '');
			itemLines.push(formatHeading(title, 3));

			// Add inline comment indicator if applicable
			if (comment.extensions?.location === 'inline') {
				itemLines.push('**📌 Inline Comment**');

				// Add the highlighted text as a blockquote if available
				if (comment.highlightedText) {
					itemLines.push('');
					// Format the highlighted text as a blockquote
					const lines = comment.highlightedText.split('\n');
					for (const line of lines) {
						itemLines.push(`> ${line}`);
					}
					itemLines.push('');
				}
			}

			// Comment metadata
			const properties: Record<string, unknown> = {
				ID: comment.id,
				Status: comment.status,
				Type:
					comment.extensions?.location === 'inline'
						? 'Inline Comment'
						: 'Page Comment',
				Created: comment._links?.self ? formatDate(new Date()) : 'N/A', // We don't have creation date in the response
			};

			// Format as a bullet list
			itemLines.push(formatBulletList(properties, (key) => key));

			// Comment content
			itemLines.push(formatHeading('Content', 4));

			// Use the pre-converted markdown content
			itemLines.push(
				comment.convertedMarkdownBody || '*No content available*',
			);

			// Add link to the comment if available
			if (comment._links?.webui) {
				const commentUrl = ensureAbsoluteConfluenceUrl(
					comment._links.webui,
					resolvedBaseUrl,
				);

				itemLines.push('');
				itemLines.push(`[View comment in Confluence](${commentUrl})`);
			}

			return itemLines.join('\n');
		},
	);

	lines.push(formattedList);

	// Add standard footer with timestamp
	lines.push('\n\n' + formatSeparator());
	lines.push(`*Information retrieved at: ${formatDate(new Date())}*`);

	// Add link to the page
	if (pageId) {
		const pageUrl = ensureAbsoluteConfluenceUrl(
			`pages/viewpage.action?pageId=${pageId}`,
			resolvedBaseUrl,
		);
		lines.push(`*View all comments on [this page](${pageUrl})*`);
	}

	return lines.join('\n');
}
