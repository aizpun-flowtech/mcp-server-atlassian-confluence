import {
	PageSchemaType,
	PageDetailedSchemaType,
} from '../services/vendor.atlassian.pages.types.js';
import { ControllerResponse } from '../types/common.types.js';
import {
	formatUrl,
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
 * Format a list of pages for display
 * @param pagesData - Raw pages data from the API
 * @param baseUrl - Base URL for constructing page links
 * @returns Formatted string with pages information in markdown format
 */
export function formatPagesList(
	pagesData: PageSchemaType[],
	baseUrl: string = '',
): string {
	const resolvedBaseUrl = resolveConfluenceBaseUrl(baseUrl);

	if (!pagesData || pagesData.length === 0) {
		return (
			'No Confluence pages found matching your criteria.' +
			'\n\n' +
			formatSeparator() +
			'\n' +
			`*Information retrieved at: ${formatDate(new Date())}*`
		);
	}

	const lines: string[] = [formatHeading('Confluence Pages', 1), ''];

	// Format each page with its details
	const formattedList = formatNumberedList(pagesData, (page, _index) => {
		const itemLines: string[] = [];

		// Basic information
		itemLines.push(formatHeading(page.title, 2));

		// Create an object with all the properties to display
		const pageUrl = ensureAbsoluteConfluenceUrl(
			`pages/viewpage.action?pageId=${page.id}`,
			resolvedBaseUrl,
		);

		const properties: Record<string, unknown> = {
			ID: page.id,
			Status: page.status,
			'Space ID': page.spaceId || 'N/A',
			Title: page.title,
			Created: page.createdAt ? formatDate(page.createdAt) : 'N/A',
			Author: page.authorId || 'Unknown',
			Version: page.version?.number || 'N/A',
			URL: formatUrl(pageUrl, page.title),
		};

		// Format as a bullet list
		itemLines.push(formatBulletList(properties, (key) => key));

		return itemLines.join('\n');
	});

	lines.push(formattedList);

	// Add standard footer with timestamp
	lines.push('\n\n' + formatSeparator());
	lines.push(`*Information retrieved at: ${formatDate(new Date())}*`);

	return lines.join('\n');
}

/**
 * Format detailed page information for display
 * @param pageData - Raw page details from the API
 * @param markdownBody - Pre-converted markdown content for the page body
 * @param commentsSummary - Optional comments data to include a summary of recent comments
 * @returns Formatted string with page details in markdown format
 */
export function formatPageDetails(
	pageData: PageDetailedSchemaType,
	markdownBody: string = '*No content available*',
	commentsSummary?: ControllerResponse | null,
): string {
	// Create URL
	const resolvedBaseUrl = resolveConfluenceBaseUrl(pageData._links.base);
	const pageUrl = pageData._links.webui || '';
	const fullUrl = ensureAbsoluteConfluenceUrl(
		pageUrl || `pages/viewpage.action?pageId=${pageData.id}`,
		resolvedBaseUrl,
	);

	const lines: string[] = [
		formatHeading(`Confluence Page: ${pageData.title}`, 1),
		'',
		`> A ${pageData.status} page in space \`${pageData.spaceId}\` created on ${formatDate(pageData.createdAt)}.`,
		'',
		formatHeading('Basic Information', 2),
	];

	// Format basic information as a bullet list
	const basicProperties: Record<string, unknown> = {
		ID: pageData.id,
		Title: pageData.title,
		'Space ID': pageData.spaceId,
		Status: pageData.status,
		'Created At': formatDate(pageData.createdAt),
		'Author ID': pageData.authorId,
		'Parent ID': pageData.parentId || 'None',
	};

	lines.push(formatBulletList(basicProperties, (key) => key));

	// Content section
	lines.push('');
	lines.push(formatHeading('Content', 2));

	// Use the pre-converted markdown body passed by the controller
	lines.push(markdownBody);

	// Comments section if available
	if (commentsSummary && commentsSummary.content) {
		lines.push('');
		lines.push(formatHeading('Recent Comments', 2));

		// Check if there's comment content to display
		if (commentsSummary.content.includes('No comments found')) {
			lines.push('*No comments found for this page*');
		} else {
			// Extract a shorter version of the comments that doesn't include the original heading
			// and footer to integrate better with our page details format
			let commentsContent = commentsSummary.content;

			// Remove the original "Page Comments" heading if it exists
			commentsContent = commentsContent.replace(
				/# Page Comments\n\n/,
				'',
			);

			// Remove the footer timestamp if it exists
			commentsContent = commentsContent.replace(
				/\n\n---+\n\*Information retrieved at:.*\*/,
				'',
			);

			// Add the extracted comments content
			lines.push(commentsContent);

			// Add a link to view all comments if there are more - check in the content string
			if (
				commentsSummary.content.includes('More results are available')
			) {
				lines.push('');

				// Link to view all comments for this page
				const allCommentsUrl = ensureAbsoluteConfluenceUrl(
					`pages/viewpage.action?pageId=${pageData.id}&showComments=true`,
					resolvedBaseUrl,
				);
				lines.push(
					`*${formatUrl(allCommentsUrl, 'View all comments on this page')}*`,
				);
			}
		}
	}

	// Labels section
	lines.push('');
	lines.push(formatHeading('Labels', 2));

	if (pageData.labels?.results && pageData.labels.results.length > 0) {
		const labelLines: string[] = [];
		pageData.labels.results.forEach(
			(label: { id: string; name: string }) => {
				labelLines.push(`- **${label.name}** (ID: ${label.id})`);
			},
		);
		lines.push(labelLines.join('\n'));
	} else {
		lines.push('*No labels assigned to this page*');
	}

	// Links section
	lines.push('');
	lines.push(formatHeading('Links', 2));
	lines.push(`- **Web UI**: ${fullUrl}`);
	lines.push(`- ${formatUrl(fullUrl, 'Open in Confluence')}`);

	// Add standard footer with timestamp
	lines.push('\n\n' + formatSeparator());
	lines.push(`*Information retrieved at: ${formatDate(new Date())}*`);

	// Optionally keep the direct link
	if (fullUrl) {
		lines.push(`*View this page in Confluence: ${fullUrl}*`);
	}

	return lines.join('\n');
}
