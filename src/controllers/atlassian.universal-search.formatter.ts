import { SearchResultType } from '../services/vendor.atlassian.search.types.js';
import {
	formatHeading,
	formatBulletList,
	formatNumberedList,
	formatSeparator,
	formatDate,
} from '../utils/formatter.util.js';
import { formatSearchResultItem } from './atlassian.search.formatter.js';

export type UniversalSearchSectionKey =
	| 'spaces'
	| 'pages'
	| 'blogPosts'
	| 'attachments'
	| 'comments';

interface UniversalSearchFormatterInput {
	query: string;
	spaceKey?: string;
	labels?: string[];
	limitPerType: number;
	includedTypes: UniversalSearchSectionKey[];
	results: Record<UniversalSearchSectionKey, SearchResultType[]>;
}

const SECTION_TITLES: Record<UniversalSearchSectionKey, string> = {
	spaces: 'Spaces',
	pages: 'Pages',
	blogPosts: 'Blog posts',
	attachments: 'Attachments',
	comments: 'Comments',
};

export function formatUniversalSearchResults(
	input: UniversalSearchFormatterInput,
): string {
	const lines: string[] = [];

	lines.push(formatHeading('Confluence Universal Search', 1));
	lines.push('');

	lines.push(formatHeading('Search Summary', 2));
	const summaryItems: Record<string, unknown> = {
		Query: `\`${input.query}\``,
		'Limit per type': `${input.limitPerType} result${
			input.limitPerType === 1 ? '' : 's'
		} per category`,
		'Included types': input.includedTypes
			.map((type) => SECTION_TITLES[type])
			.join(', '),
	};

	if (input.spaceKey) {
		summaryItems['Space filter'] = input.spaceKey;
	}

	if (input.labels && input.labels.length > 0) {
		summaryItems['Label filter'] = input.labels.join(', ');
	}

	lines.push(formatBulletList(summaryItems, (key) => key));
	lines.push('');

	let totalResults = 0;

	for (const type of input.includedTypes) {
		const sectionTitle = SECTION_TITLES[type];
		const sectionResults = input.results[type] || [];
		totalResults += sectionResults.length;

		lines.push(
			formatHeading(`${sectionTitle} (${sectionResults.length})`, 2),
		);

		if (sectionResults.length === 0) {
			lines.push('_No results found in this category._');
			lines.push('');
			continue;
		}

		lines.push(
			formatNumberedList(sectionResults, (result) =>
				formatSearchResultItem(result),
			),
		);
		lines.push('');
	}

	if (totalResults === 0) {
		lines.push(
			'_No matches were found across the selected content types. Try broadening your query or enabling more result types._',
		);
		lines.push('');
	}

	lines.push(formatSeparator());
	lines.push(`*Information retrieved at: ${formatDate(new Date())}*`);
	lines.push(
		'_Tip: use `conf_search` (tool) or `mcp-atlassian-confluence search` (CLI) for advanced CQL filtering or pagination._',
	);

	return lines.join('\n').trim();
}
