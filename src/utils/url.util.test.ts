import {
	ensureAbsoluteConfluenceUrl,
	resolveConfluenceBaseUrl,
} from './url.util.js';

describe('url.util', () => {
	const originalSiteName = process.env.ATLASSIAN_SITE_NAME;

	afterEach(() => {
		if (originalSiteName) {
			process.env.ATLASSIAN_SITE_NAME = originalSiteName;
		} else {
			delete process.env.ATLASSIAN_SITE_NAME;
		}
	});

	it('returns absolute URLs unchanged', () => {
		const url = 'https://example.com/wiki/page';
		expect(ensureAbsoluteConfluenceUrl(url)).toBe(url);
	});

	it('combines relative paths with absolute base URLs', () => {
		const result = ensureAbsoluteConfluenceUrl(
			'pages/viewpage.action?pageId=123',
			'https://example.atlassian.net/wiki',
		);

		expect(result).toBe(
			'https://example.atlassian.net/wiki/pages/viewpage.action?pageId=123',
		);
	});

	it('normalizes leading slash paths when base includes /wiki', () => {
		const result = ensureAbsoluteConfluenceUrl(
			'/wiki/spaces/TEAM/pages/42',
			'https://example.atlassian.net/wiki',
		);

		expect(result).toBe(
			'https://example.atlassian.net/wiki/spaces/TEAM/pages/42',
		);
	});

	it('uses site environment fallback when base is missing', () => {
		process.env.ATLASSIAN_SITE_NAME = 'acme';

		const result = ensureAbsoluteConfluenceUrl('spaces/ACME');

		expect(result).toBe('https://acme.atlassian.net/wiki/spaces/ACME');
	});

	it('handles leading slash with environment fallback', () => {
		process.env.ATLASSIAN_SITE_NAME = 'acme';

		const result = ensureAbsoluteConfluenceUrl('/spaces/ACME');

		expect(result).toBe('https://acme.atlassian.net/wiki/spaces/ACME');
	});

	it('returns original path when no base or environment is available', () => {
		delete process.env.ATLASSIAN_SITE_NAME;

		expect(ensureAbsoluteConfluenceUrl('/spaces/ACME')).toBe(
			'/spaces/ACME',
		);
	});

	it('resolves relative base URLs using environment', () => {
		process.env.ATLASSIAN_SITE_NAME = 'acme';

		const base = resolveConfluenceBaseUrl('/wiki');

		expect(base).toBe('https://acme.atlassian.net/wiki');
	});
});
