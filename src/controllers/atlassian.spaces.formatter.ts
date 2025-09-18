import { z } from 'zod';
import {
	SpacesResponseSchema,
	SpaceDetailedSchemaType,
} from '../services/vendor.atlassian.spaces.types.js';
import { PagesResponseSchema } from '../services/vendor.atlassian.pages.types.js';
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
 * Format a list of spaces for display
 * @param spacesData - Raw spaces data from the API
 * @returns Formatted string with spaces information in markdown format
 */
export function formatSpacesList(
	spacesData: z.infer<typeof SpacesResponseSchema>,
): string {
	const resolvedBaseUrl = resolveConfluenceBaseUrl(spacesData._links?.base);

	if (!spacesData.results || spacesData.results.length === 0) {
		return (
			'No Confluence spaces found matching your criteria.' +
			'\n\n' +
			formatSeparator() +
			'\n' +
			`*Information retrieved at: ${formatDate(new Date())}*`
		);
	}

	const lines: string[] = [formatHeading('Confluence Spaces', 1), ''];

	// Use the numbered list formatter for consistent formatting
	const formattedList = formatNumberedList(
		spacesData.results,
		(space, _index) => {
			// Ensure space has the correct inferred type, or use any if complex
			const typedSpace = space as z.infer<
				typeof SpacesResponseSchema
			>['results'][number];
			const itemLines: string[] = [];
			itemLines.push(formatHeading(typedSpace.name, 2));

			// Basic properties
			const properties: Record<string, unknown> = {
				ID: typedSpace.id,
				Key: typedSpace.key,
				Type: typedSpace.type,
				Status: typedSpace.status,
				Created: typedSpace.createdAt
					? formatDate(typedSpace.createdAt)
					: 'N/A',
				'Homepage ID': typedSpace.homepageId || 'Not set',
				Description:
					typedSpace.description?.view?.value || 'Not available',
				URL: formatUrl(
					ensureAbsoluteConfluenceUrl(
						typedSpace._links?.webui || `spaces/${typedSpace.key}`,
						typedSpace._links?.base || resolvedBaseUrl,
					),
					typedSpace.key,
				),
			};

			if (typedSpace.currentActiveAlias) {
				properties['Alias'] = typedSpace.currentActiveAlias;
			}

			// Format as a bullet list with proper formatting for each value type
			itemLines.push(formatBulletList(properties, (key) => key));

			return itemLines.join('\n');
		},
	);

	lines.push(formattedList);

	// Add standard footer with timestamp
	lines.push('\n\n' + formatSeparator());
	lines.push(`*Information retrieved at: ${formatDate(new Date())}*`);

	return lines.join('\n');
}

/**
 * Format detailed space information for display
 * @param spaceData - Raw space details from the API
 * @param homepageContent - Optional homepage content to include
 * @param topLevelPagesData - Optional top-level pages data to include
 * @returns Formatted string with space details in markdown format
 */
export function formatSpaceDetails(
	spaceData: SpaceDetailedSchemaType,
	homepageContent?: string,
	topLevelPagesData?: z.infer<typeof PagesResponseSchema> | null,
): string {
	// Create URL
	const resolvedBaseUrl = resolveConfluenceBaseUrl(spaceData._links.base);
	const spaceUrl = spaceData._links.webui || '';
	const fullUrl = ensureAbsoluteConfluenceUrl(
		spaceUrl || `spaces/${spaceData.key}`,
		resolvedBaseUrl,
	);

	const lines: string[] = [
		formatHeading(`Confluence Space: ${spaceData.key}`, 1),
		'',
		`> A ${spaceData.status} ${spaceData.type} space with key \`${spaceData.key}\` created on ${formatDate(spaceData.createdAt)}.`,
		'',
		formatHeading('Basic Information', 2),
	];

	// Format basic information as a bullet list
	const basicProperties: Record<string, unknown> = {
		ID: spaceData.id,
		Key: spaceData.key,
		Name: spaceData.name,
		Type: spaceData.type,
		Status: spaceData.status,
		'Created At': formatDate(spaceData.createdAt),
		'Author ID': spaceData.authorId,
		'Homepage ID': spaceData.homepageId,
		'Current Alias': spaceData.currentActiveAlias,
	};

	lines.push(formatBulletList(basicProperties, (key) => key));

	// Description section
	if (
		spaceData.description?.view?.value ||
		spaceData.description?.plain?.value
	) {
		lines.push('');
		lines.push(formatHeading('Description', 2));

		const viewValue = spaceData.description?.view?.value;
		const plainValue = spaceData.description?.plain?.value;

		if (viewValue && viewValue.trim()) {
			lines.push(viewValue.trim());
		} else if (plainValue && plainValue.trim()) {
			lines.push(plainValue.trim());
		} else {
			lines.push('*No description provided*');
		}
	}

	// Homepage content section (placed after description)
	if (spaceData.homepageId) {
		lines.push('');
		lines.push(formatHeading('Homepage Content', 2));
		if (homepageContent) {
			lines.push(homepageContent);
		} else {
			lines.push('*No homepage content available*');
		}
	}

	// Top-level pages section
	if (
		topLevelPagesData &&
		topLevelPagesData.results &&
		topLevelPagesData.results.length > 0
	) {
		lines.push('');
		lines.push(formatHeading('Recent Pages', 2));

		const pagesFormatted = formatNumberedList(
			topLevelPagesData.results,
			(page) => {
				// Get the page URL
				const pageUrl = page._links?.webui || '';
				const fullPageUrl = ensureAbsoluteConfluenceUrl(
					pageUrl || `pages/viewpage.action?pageId=${page.id}`,
					resolvedBaseUrl,
				);

				// Format last modified date
				const lastModified = page.version?.createdAt
					? formatDate(page.version.createdAt)
					: 'N/A';

				// Create a list of page properties
				const pageProps = {
					ID: page.id,
					Title: page.title,
					'Last Modified': lastModified,
					Link: formatUrl(fullPageUrl, 'Open Page'),
				};

				// Return the formatted page info
				return formatBulletList(pageProps, (key) => key);
			},
		);

		lines.push(pagesFormatted);
		lines.push('');

		// Add link to view all pages in this space
		const spaceViewAllPagesUrl = ensureAbsoluteConfluenceUrl(
			`spaces/${spaceData.key}/pages`,
			resolvedBaseUrl,
		);
		lines.push(
			`*${formatUrl(spaceViewAllPagesUrl, 'View all pages in this space')}*`,
		);
	} else if (topLevelPagesData) {
		lines.push('');
		lines.push(formatHeading('Recent Pages', 2));
		lines.push('*No pages found in this space*');
	}

	// Labels section
	if (spaceData.labels?.results) {
		lines.push('');
		lines.push(formatHeading('Labels', 2));

		if (spaceData.labels.results.length === 0) {
			lines.push('*No labels assigned to this space*');
		} else {
			const labelLines: string[] = [];
			spaceData.labels.results.forEach((label) => {
				const prefix = label.prefix ? `${label.prefix}:` : '';
				labelLines.push(
					`- **${prefix}${label.name}** (ID: ${label.id})`,
				);
			});

			lines.push(labelLines.join('\n'));

			// The meta property might not have hasMore in the Zod schema
			if (
				spaceData.labels.meta?.count &&
				spaceData.labels.results.length <
					(spaceData.labels.meta.count || 0)
			) {
				lines.push('');
				lines.push('*More labels are available but not shown*');
			}
		}
	}

	// Links section
	lines.push('');
	lines.push(formatHeading('Links', 2));

	const links: string[] = [];
	links.push(`- **Web UI**: ${fullUrl}`);
	links.push(`- ${formatUrl(fullUrl, 'Open in Confluence')}`);

	if (spaceData.homepageId) {
		// Construct homepage URL carefully using base and ID
		const fullHomepageUrl = ensureAbsoluteConfluenceUrl(
			`spaces/${spaceData.key}/pages/${spaceData.homepageId}`,
			resolvedBaseUrl,
		);
		links.push(`- ${formatUrl(fullHomepageUrl, 'View Homepage')}`);
	}

	lines.push(links.join('\n'));

	// Add standard footer with timestamp
	lines.push('\n\n' + formatSeparator());
	lines.push(`*Information retrieved at: ${formatDate(new Date())}*`);

	// Optionally keep the direct link
	if (fullUrl) {
		lines.push(`*View this space in Confluence: ${fullUrl}*`);
	}

	return lines.join('\n');
}
