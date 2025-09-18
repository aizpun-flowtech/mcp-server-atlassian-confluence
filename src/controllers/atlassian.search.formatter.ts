import { SearchResultType } from '../services/vendor.atlassian.search.types.js';
import {
	formatHeading,
	formatBulletList,
	formatNumberedList,
	formatSeparator,
	formatDate,
} from '../utils/formatter.util.js';
import { ensureAbsoluteConfluenceUrl } from '../utils/url.util.js';

/**
 * Format search results for display
 * @param searchData - Raw search results from the API
 * @returns Formatted string with search results in markdown format
 */
export function formatSearchResultItem(result: SearchResultType): string {
	const itemLines: string[] = [];

	const title = result.title || result.content?.title || 'Untitled Result';

	const properties: Record<string, unknown> = {
		ID: result.content?.id || result.id || 'N/A',
		Type: result.content?.type || result.entityType || 'N/A',
		Status: result.content?.status || 'N/A',
		Space:
			result.space?.name || result.resultGlobalContainer?.title || 'N/A',
	};

	if (result.space?.id) {
		properties['Space ID'] = result.space.id;
	}

	const rawUrl =
		result.url ||
		result.content?._links?.webui ||
		result.resultGlobalContainer?.displayUrl;

	if (rawUrl) {
		const absoluteUrl = ensureAbsoluteConfluenceUrl(rawUrl);
		properties['URL'] = {
			url: absoluteUrl,
			title: 'View in Confluence',
		};
	}

	const excerpt = result.excerpt || result.content?.excerpt?.content;

	if (excerpt) {
		properties['Excerpt'] = excerpt;
	}

	const modified =
		result.lastModified ||
		result.content?.lastModified ||
		result.friendlyLastModified;

	if (modified) {
		try {
			properties['Modified'] = formatDate(new Date(modified));
		} catch {
			properties['Modified'] = modified;
		}
	}

	itemLines.push(formatHeading(title, 2));
	itemLines.push(formatBulletList(properties, (key) => key));

	return itemLines.join('\n');
}

export function formatSearchResults(searchData: SearchResultType[]): string {
	if (searchData.length === 0) {
		return (
			'No Confluence content found matching your query.' +
			'\n\n' +
			formatSeparator() +
			'\n' +
			`*Information retrieved at: ${formatDate(new Date())}*`
		);
	}

	const lines: string[] = [formatHeading('Confluence Search Results', 1), ''];

	const formattedList = formatNumberedList(searchData, (result) =>
		formatSearchResultItem(result),
	);

	lines.push(formattedList);

	lines.push('\n\n' + formatSeparator());
	lines.push(`*Information retrieved at: ${formatDate(new Date())}*`);

	return lines.join('\n');
}
