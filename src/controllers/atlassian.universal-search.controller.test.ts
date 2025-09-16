import atlassianUniversalSearchController from './atlassian.universal-search.controller.js';
import atlassianSearchService from '../services/vendor.atlassian.search.service.js';
import type {
	SearchParams,
	SearchResponseType,
} from '../services/vendor.atlassian.search.types.js';

describe('atlassian.universal-search.controller', () => {
	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('searches titles first and falls back to full content for non-space types', async () => {
		const emptyResponse: SearchResponseType = {
			results: [],
		};

		const searchMock = jest
			.spyOn(atlassianSearchService, 'search')
			.mockResolvedValue(emptyResponse);

		const response = await atlassianUniversalSearchController.search({
			query: 'incident',
		});

		expect(response.content).toContain('Confluence Universal Search');
		expect(searchMock).toHaveBeenCalled();

		const spaceCall = searchMock.mock.calls.find(([params]) =>
			params.cql.includes('type = space'),
		);
		expect(spaceCall).toBeDefined();
		const [spaceParams] = spaceCall as [SearchParams];
		expect(spaceParams.cql).toContain('title ~ "incident"');
		expect(spaceParams.cql).not.toContain('OR text');

		const contentTypes = ['page', 'blogpost', 'attachment', 'comment'];

		for (const expectedType of contentTypes) {
			const typeCall = searchMock.mock.calls.find(([params]) =>
				params.cql.includes(`type = ${expectedType}`),
			);
			expect(typeCall).toBeDefined();
			const [typeParams] = typeCall as [SearchParams];
			expect(typeParams.cql).toContain(
				'(title ~ "incident" OR text ~ "incident")',
			);
		}
	});
});
