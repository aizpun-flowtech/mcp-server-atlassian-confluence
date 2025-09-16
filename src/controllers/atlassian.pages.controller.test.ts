import atlassianPagesController from './atlassian.pages.controller.js';
import {
	getAtlassianCredentials,
	hasAtlassianAuthCredentials,
} from '../utils/transport.util.js';
import { config } from '../utils/config.util.js';
import { McpError } from '../utils/error.util.js';

describe('Atlassian Pages Controller', () => {
	// Load configuration before all tests
	beforeAll(() => {
		// Load configuration from all sources
		config.load();

		const credentials = getAtlassianCredentials();
		if (!hasAtlassianAuthCredentials(credentials)) {
			console.warn(
				'Skipping Atlassian Pages Controller tests: No authenticated credentials available',
			);
		}
	});

	// Helper function to skip tests when credentials are missing
	const skipIfNoCredentials = () =>
		!hasAtlassianAuthCredentials(getAtlassianCredentials());

	describe('list', () => {
		it('should return a formatted list of pages', async () => {
			if (skipIfNoCredentials()) return;

			// Call the function
			const result = await atlassianPagesController.list();

			// Verify the response structure
			expect(result).toHaveProperty('content');
			expect(typeof result.content).toBe('string');

			// Verify the content format
			if (
				!result.content.includes(
					'No Confluence pages found matching your criteria.',
				)
			) {
				expect(result.content).toContain('# Confluence Pages');
				expect(result.content).toContain('**ID**');
				expect(result.content).toContain('**Title**');
				expect(result.content).toContain('**Space ID**');
				expect(result.content).toContain('**Status**');

				// Check for pagination information in the content if it exists
				expect(result.content).toContain('Information retrieved at:');
				if (result.content.includes('More results are available')) {
					expect(result.content).toMatch(
						/\*Use --cursor "([^"]+)" to view more\.\*/,
					);
				}
			}
		}, 15000);

		it('should handle filtering by space ID', async () => {
			if (skipIfNoCredentials()) return;

			// First, get a list of pages to find a valid space ID
			const initialResult = await atlassianPagesController.list();

			// Skip if no pages are available
			if (
				initialResult.content.includes(
					'No Confluence pages found matching your criteria.',
				)
			) {
				console.warn('Skipping test: No pages available');
				return;
			}

			// Extract a space ID from the list result
			const match = initialResult.content.match(
				/\*\*Space ID\*\*: ([0-9]+)/,
			);
			if (!match || !match[1]) {
				console.warn(
					'Skipping test: Could not extract space ID from list result',
				);
				return;
			}

			const spaceId = match[1];

			// Call the function with the space ID filter using spaceIds
			const result = await atlassianPagesController.list({
				spaceIds: [spaceId],
			});

			// Verify the response
			expect(result).toHaveProperty('content');
			expect(typeof result.content).toBe('string');

			// If results were found, verify they contain the space ID
			if (
				!result.content.includes(
					'No Confluence pages found matching your criteria.',
				)
			) {
				expect(result.content).toContain(`**Space ID**: ${spaceId}`);
			}
		}, 15000);

		it('should handle filtering by status', async () => {
			if (skipIfNoCredentials()) return;

			// Test filtering by 'current' status
			const result = await atlassianPagesController.list({
				status: ['current'],
				limit: 5,
			});

			// Verify the response
			expect(result).toHaveProperty('content');
			expect(typeof result.content).toBe('string');

			// If results were found, verify they contain current status
			if (
				!result.content.includes(
					'No Confluence pages found matching your criteria.',
				)
			) {
				expect(result.content).toContain('**Status**: current');
				// No archived status should be present
				expect(result.content).not.toContain('**Status**: archived');
			}
		}, 15000);

		it('should handle filtering by query (title search)', async () => {
			if (skipIfNoCredentials()) return;

			// First, get a list of pages to find a common term to search for
			const initialResult = await atlassianPagesController.list({
				limit: 5,
			});

			// Skip if no pages are available
			if (
				initialResult.content.includes(
					'No Confluence pages found matching your criteria.',
				)
			) {
				console.warn('Skipping test: No pages available');
				return;
			}

			// Extract a title to search for a fragment of it
			const titleMatch = initialResult.content.match(
				/\*\*Title\*\*: ([^\n]+)/,
			);

			// If we can't find a title, use a generic search term
			let searchTerm = 'a';
			if (titleMatch && titleMatch[1]) {
				const words = titleMatch[1].split(' ');
				if (words.length > 0 && words[0].length > 3) {
					searchTerm = words[0];
				}
			}

			// Call the function with the query filter
			const result = await atlassianPagesController.list({
				title: searchTerm,
				limit: 5,
			});

			// Verify the response
			expect(result).toHaveProperty('content');
			expect(typeof result.content).toBe('string');

			// Note: We can't guarantee the search will find results, so
			// we only verify the call completes successfully
		}, 15000);

		it('should handle sorting with different parameters', async () => {
			if (skipIfNoCredentials()) return;

			// Test sorting by created date ascending
			const ascResult = await atlassianPagesController.list({
				sort: 'created-date',
				limit: 5,
			});

			// Test sorting by created date descending
			const descResult = await atlassianPagesController.list({
				sort: '-created-date',
				limit: 5,
			});

			// Verify the responses
			expect(ascResult).toHaveProperty('content');
			expect(descResult).toHaveProperty('content');

			// Note: It's difficult to verify sorting in Markdown output,
			// so we just verify the calls complete successfully
		}, 15000);

		// Updated test for pagination
		it('should handle pagination with limit and cursor', async () => {
			if (skipIfNoCredentials()) return;

			// Get the first page with a small limit
			const firstPageResult = await atlassianPagesController.list({
				limit: 2,
			});

			// Verify the first page response
			expect(firstPageResult).toHaveProperty('content');
			expect(typeof firstPageResult.content).toBe('string');

			// If there are more pages indicated in the content, test cursor-based pagination
			// Extract cursor from content
			const cursorMatch = firstPageResult.content.match(
				/\*Use --cursor "([^"]+)" to view more\.\*/,
			);
			const nextCursor = cursorMatch ? cursorMatch[1] : null;

			if (
				nextCursor &&
				firstPageResult.content.includes('More results are available')
			) {
				// Get the second page using the cursor from first page
				const secondPageResult = await atlassianPagesController.list({
					limit: 2,
					cursor: nextCursor,
				});

				// Verify the second page response
				expect(secondPageResult).toHaveProperty('content');
				expect(typeof secondPageResult.content).toBe('string');
			} else {
				console.info('Skipping cursor test: No more pages available');
			}
		}, 15000);

		it('should handle empty results gracefully', async () => {
			if (skipIfNoCredentials()) return;

			// Instead of mocking, use a unique search term guaranteed to return no results
			const uniqueSearchTerm = `NonExistentPage${Date.now()}${Math.random().toString(36).substring(2, 8)}`;

			// Call with a search term that won't match any pages
			const result = await atlassianPagesController.list({
				title: uniqueSearchTerm,
			});

			// Verify the empty result message
			expect(result.content).toContain(
				'No Confluence pages found matching your criteria.',
			);
			expect(result.content).toContain('Information retrieved at:');
		}, 15000);

		it('should handle combinations of filters', async () => {
			if (skipIfNoCredentials()) return;

			// First, get a list of pages to find a valid space ID
			const initialResult = await atlassianPagesController.list();

			// Skip if no pages are available
			if (
				initialResult.content.includes(
					'No Confluence pages found matching your criteria.',
				)
			) {
				console.warn('Skipping test: No pages available');
				return;
			}

			// Extract a space ID from the list result
			const spaceMatch = initialResult.content.match(
				/\*\*Space ID\*\*: ([0-9]+)/,
			);

			if (!spaceMatch || !spaceMatch[1]) {
				console.warn('Skipping test: Could not extract space ID');
				return;
			}

			const spaceId = spaceMatch[1];

			// Combine filters: space ID + status + limit using spaceIds
			const result = await atlassianPagesController.list({
				spaceIds: [spaceId],
				status: ['current'],
				limit: 3,
			});

			// Verify the response
			expect(result).toHaveProperty('content');

			// If results were found, verify they contain both filters
			if (
				!result.content.includes(
					'No Confluence pages found matching your criteria.',
				)
			) {
				expect(result.content).toContain(`**Space ID**: ${spaceId}`);
				expect(result.content).toContain('**Status**: current');

				// Check that the limit was respected
				const entriesCount = (
					result.content.match(/\*\*ID\*\*:/g) || []
				).length;
				expect(entriesCount).toBeLessThanOrEqual(3);
			}
		}, 15000);

		it('should handle invalid space ID by throwing an error', async () => {
			if (skipIfNoCredentials()) return;

			// Call with an invalid space ID format using spaceIds
			await expect(
				atlassianPagesController.list({
					spaceIds: ['invalid-space-id'],
				}),
			).rejects.toThrow(McpError);

			// Try to catch the error to verify its properties using spaceIds
			try {
				await atlassianPagesController.list({
					spaceIds: ['invalid-space-id'],
				});
			} catch (error) {
				expect(error).toBeInstanceOf(McpError);
				if (error instanceof McpError) {
					// Don't check for specific message content since it comes from the API
					expect(error.type).toBe('API_ERROR');
				}
			}
		}, 15000);

		it('should handle invalid sort parameter by throwing an error', async () => {
			if (skipIfNoCredentials()) return;

			// Call with an invalid sort parameter
			await expect(
				atlassianPagesController.list({
					sort: 'invalid' as any,
				}),
			).rejects.toThrow(McpError);
		}, 15000);
	});

	describe('get', () => {
		// Helper function to get a valid page ID for testing
		async function getFirstPageId(): Promise<string | null> {
			if (skipIfNoCredentials()) return null;

			try {
				const listResult = await atlassianPagesController.list({
					limit: 1,
				});

				// Skip if no pages are available
				if (
					listResult.content.includes(
						'No Confluence pages found matching your criteria.',
					)
				) {
					return null;
				}

				// Extract a page ID from the list result
				const match = listResult.content.match(/\*\*ID\*\*: ([0-9]+)/);
				return match && match[1] ? match[1] : null;
			} catch (error) {
				console.warn('Could not extract page ID for tests:', error);
				return null;
			}
		}

		it('should return formatted details for a valid page ID', async () => {
			if (skipIfNoCredentials()) return;

			// Get a valid page ID for testing
			const pageId = await getFirstPageId();

			// Skip if no page ID was found
			if (!pageId) {
				console.warn('Skipping test: No valid page ID found');
				return;
			}

			// Call the function with the extracted ID
			const result = await atlassianPagesController.get({
				pageId: pageId,
			});

			// Verify the response structure
			expect(result).toHaveProperty('content');
			expect(typeof result.content).toBe('string');

			// Verify the content format
			expect(result.content).toContain('# Confluence Page:');
			expect(result.content).toContain(`**ID**: ${pageId}`);
			expect(result.content).toContain('**Title**:');
			expect(result.content).toContain('**Space ID**:');
			expect(result.content).toContain('**Status**:');
			expect(result.content).toContain('**Created At**:');
			expect(result.content).toContain('**Author ID**:');
			expect(result.content).toContain('## Basic Information');
			expect(result.content).toContain('## Content');
			expect(result.content).toContain('## Labels');
			expect(result.content).toContain('## Links');
			expect(result.content).toContain('**Web UI**:');
			expect(result.content).toContain('*Information retrieved at:');
			expect(result.content).toContain('*View this page in Confluence: ');
		}, 15000);

		it('should include content body in the page details', async () => {
			if (skipIfNoCredentials()) return;

			// Get a valid page ID for testing
			const pageId = await getFirstPageId();

			// Skip if no page ID was found
			if (!pageId) {
				console.warn('Skipping test: No valid page ID found');
				return;
			}

			// Call the function with the extracted ID
			const result = await atlassianPagesController.get({
				pageId: pageId,
			});

			// Verify content section is included
			expect(result.content).toContain('## Content');

			// Content might be empty, but the section header should exist
		}, 15000);

		it('should throw an error for invalid page ID format', async () => {
			if (skipIfNoCredentials()) return;

			// Use an invalid ID (non-numeric)
			const invalidId = 'invalid-page-id';

			// Try to catch the error to verify its properties
			await expect(
				atlassianPagesController.get({ pageId: invalidId }),
			).rejects.toThrow(McpError);

			try {
				await atlassianPagesController.get({ pageId: invalidId });
				fail('Expected an error to be thrown');
			} catch (error) {
				expect(error).toBeInstanceOf(McpError);
				if (error instanceof McpError) {
					// Error type could be API_ERROR or INVALID_INPUT
					expect(['API_ERROR', 'INVALID_INPUT']).toContain(
						error.type,
					);
				}
			}
		}, 15000);

		it('should throw an error for non-existent page ID', async () => {
			if (skipIfNoCredentials()) return;

			// Test with non-existent page ID
			try {
				await atlassianPagesController.get({ pageId: '999999999' });
				fail('Expected an error to be thrown');
			} catch (error) {
				if (error instanceof McpError) {
					expect(error.statusCode).toBe(404);
					expect(error.type).toBe('NOT_FOUND'); // NOT_FOUND for resource not found (updated to match error handler behavior)
				}
			}
		}, 15000);
	});
});
