/**
 * Specialized formatter for Confluence inline comments
 */

import { CommentData } from '../services/vendor.atlassian.comments.types.js';
import {
	formatDate,
	formatHeading,
	formatSeparator,
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
 * Format a list of inline comments for display with specialized inline formatting
 *
 * @param commentsData - Raw inline comments data with pre-converted markdown content
 * @param pageId - ID of the page the comments belong to
 * @param baseUrl - Base URL for constructing comment links
 * @param totalCount - Total number of inline comments found (before pagination)
 * @param start - Starting index for pagination
 * @param limit - Number of items per page
 * @returns Formatted string with inline comments information in markdown format
 */
export function formatInlineCommentsList(
	commentsData: CommentWithMarkdown[],
	pageId: string,
	baseUrl: string = '',
	totalCount: number = 0,
	start: number = 0,
	limit: number = 25,
): string {
	const resolvedBaseUrl = resolveConfluenceBaseUrl(baseUrl);

	if (!commentsData || commentsData.length === 0) {
		return (
			formatHeading('Inline Comments', 1) +
			'\n\n' +
			'No inline comments found for this page.' +
			'\n\n' +
			'*Inline comments are comments attached to specific text selections within the page content.*' +
			'\n\n' +
			formatSeparator() +
			'\n' +
			`*Information retrieved at: ${formatDate(new Date())}*`
		);
	}

	const lines: string[] = [
		formatHeading('Inline Comments', 1),
		`Found **${totalCount}** inline comment(s) on this page.`,
		'',
	];

	if (start > 0 || commentsData.length < totalCount) {
		lines.push(
			`*Showing ${start + 1}-${start + commentsData.length} of ${totalCount} inline comments.*`,
		);
		lines.push('');
	}

	commentsData.forEach((comment, index) => {
		const actualIndex = start + index + 1;
		lines.push(formatHeading(`Inline Comment #${actualIndex}`, 2));

		// Show highlighted text prominently first
		if (comment.highlightedText) {
			lines.push(formatHeading('📌 Highlighted Text', 3));
			lines.push('```');
			// Split long highlighted text into multiple lines for readability
			const highlightedLines = comment.highlightedText
				.split('\n')
				.map((line) => line.trim())
				.filter((line) => line.length > 0);

			if (highlightedLines.length > 0) {
				highlightedLines.forEach((line) => {
					// Wrap long lines at approximately 80 characters
					if (line.length > 80) {
						const words = line.split(' ');
						let currentLine = '';
						for (const word of words) {
							if (currentLine.length + word.length + 1 > 80) {
								if (currentLine) {
									lines.push(currentLine);
									currentLine = word;
								} else {
									lines.push(word);
								}
							} else {
								currentLine += (currentLine ? ' ' : '') + word;
							}
						}
						if (currentLine) {
							lines.push(currentLine);
						}
					} else {
						lines.push(line);
					}
				});
			} else {
				lines.push(comment.highlightedText);
			}
			lines.push('```');
			lines.push('');
		} else {
			lines.push('*📌 No highlighted text context available*');
			lines.push('');
		}

		// Show comment metadata
		lines.push(formatHeading('💬 Comment Details', 3));
		lines.push(`**Comment ID:** ${comment.id}`);
		lines.push(`**Status:** ${comment.status}`);
		lines.push(`**Title:** ${comment.title.replace(/^Re: /, '')}`);

		// Show position context if available
		const position = comment.extensions?.inlineProperties?.markerRef;
		if (position) {
			lines.push(`**Position Marker:** ${position}`);
		}

		const containerId = comment.extensions?.inlineProperties?.containerId;
		if (containerId) {
			lines.push(`**Container:** ${containerId}`);
		}

		lines.push('');

		// Show comment content
		lines.push(formatHeading('📝 Comment Content', 3));
		lines.push(comment.convertedMarkdownBody || '*No content available*');

		// Add link to the comment if available
		if (comment._links?.webui) {
			const commentUrl = ensureAbsoluteConfluenceUrl(
				comment._links.webui,
				resolvedBaseUrl,
			);

			lines.push('');
			lines.push(`[🔗 View comment in Confluence](${commentUrl})`);
		}

		// Add separator between comments (except for the last one)
		if (index < commentsData.length - 1) {
			lines.push('\n' + formatSeparator() + '\n');
		}
	});

	// Add pagination information if needed
	if (totalCount > limit) {
		lines.push('\n\n' + formatHeading('Pagination', 3));
		const hasMore = start + commentsData.length < totalCount;
		if (hasMore) {
			const nextStart = start + limit;
			lines.push(
				`*Use \`start: ${nextStart}\` to view the next ${Math.min(limit, totalCount - nextStart)} inline comments.*`,
			);
		}
		if (start > 0) {
			const prevStart = Math.max(0, start - limit);
			lines.push(
				`*Use \`start: ${prevStart}\` to view the previous ${limit} inline comments.*`,
			);
		}
	}

	// Add standard footer with timestamp
	lines.push('\n\n' + formatSeparator());
	lines.push(`*Information retrieved at: ${formatDate(new Date())}*`);

	// Add link to the page
	if (pageId) {
		const pageUrl = ensureAbsoluteConfluenceUrl(
			`pages/viewpage.action?pageId=${pageId}`,
			resolvedBaseUrl,
		);
		lines.push(
			`*View all content and comments on [this page](${pageUrl})*`,
		);
	}

	return lines.join('\n');
}
