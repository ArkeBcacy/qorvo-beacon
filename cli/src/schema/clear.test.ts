import type Client from '#cli/cs/api/Client.js';
import type { ContentType } from '#cli/cs/content-types/Types.js';
import type { Entry } from '#cli/cs/entries/Types.js';
import type UiContext from '#cli/ui/UiContext.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import clear from './clear.js';

vi.mock('#cli/cs/content-types/index.js');
vi.mock('#cli/cs/content-types/delete.js');
vi.mock('#cli/cs/entries/index.js');
vi.mock('#cli/cs/entries/delete.js');
vi.mock('#cli/cs/global-fields/index.js');
vi.mock('#cli/cs/global-fields/delete.js');
vi.mock('#cli/cs/taxonomies/index.js');
vi.mock('#cli/cs/taxonomies/delete.js');
vi.mock('#cli/cs/assets/index.js');
vi.mock('#cli/cs/assets/delete.js');
vi.mock('#cli/cs/assets/deleteFolder.js');

describe('clear', () => {
	let mockClient: Client;
	let mockUi: UiContext;

	beforeEach(() => {
		mockClient = {} as Client;
		mockUi = {
			createProgressBar: vi.fn().mockReturnValue({
				increment: vi.fn(),
				update: vi.fn(),
				[Symbol.dispose]: vi.fn(),
			}),
			options: {
				schema: {
					assets: {
						isIncluded: vi.fn().mockReturnValue(true),
					},
				},
			},
			warn: vi.fn(),
		} as unknown as UiContext;
	});

	describe('when no content types specified', () => {
		it('should delete all content types, global fields, taxonomies, and assets', async () => {
			const indexContentTypes = await import('#cli/cs/content-types/index.js');
			const indexGlobalFields = await import('#cli/cs/global-fields/index.js');
			const indexTaxonomies = await import('#cli/cs/taxonomies/index.js');
			const indexAssets = await import('#cli/cs/assets/index.js');

			vi.mocked(indexContentTypes.default).mockResolvedValue(new Map());
			vi.mocked(indexGlobalFields.default).mockResolvedValue(new Map());
			vi.mocked(indexTaxonomies.default).mockResolvedValue(new Map());
			vi.mocked(indexAssets.default).mockResolvedValue(new Map());

			await clear(mockClient, mockUi, false, []);

			expect(indexContentTypes.default).toHaveBeenCalled();
			expect(indexGlobalFields.default).toHaveBeenCalled();
			expect(indexTaxonomies.default).toHaveBeenCalled();
			expect(indexAssets.default).toHaveBeenCalled();
		});
	});

	describe('when content types specified', () => {
		it('should only delete entries for specified content types', async () => {
			const indexContentTypes = await import('#cli/cs/content-types/index.js');
			const indexGlobalFields = await import('#cli/cs/global-fields/index.js');
			const indexEntries = await import('#cli/cs/entries/index.js');
			const deleteEntry = await import('#cli/cs/entries/delete.js');

			const mockContentType: ContentType = {
				title: 'Test Content Type',
				uid: 'test_ct',
			} as ContentType;

			const mockEntry: Entry = {
				title: 'Test Entry',
				uid: 'blt123',
			} as Entry;

			vi.mocked(indexContentTypes.default).mockResolvedValue(
				new Map([['test_ct', mockContentType]]),
			);
			vi.mocked(indexGlobalFields.default).mockResolvedValue(new Map());
			vi.mocked(indexEntries.default).mockResolvedValue(
				new Map([['Test Entry', mockEntry]]),
			);
			vi.mocked(deleteEntry.default).mockResolvedValue();

			await clear(mockClient, mockUi, false, ['test_ct']);

			expect(indexContentTypes.default).toHaveBeenCalled();
			expect(indexGlobalFields.default).toHaveBeenCalled();
			expect(indexEntries.default).toHaveBeenCalledWith(
				mockClient,
				expect.any(Map),
				mockContentType,
			);
			expect(deleteEntry.default).toHaveBeenCalledWith(
				mockClient,
				'test_ct',
				'blt123',
			);
		});

		it('should warn when no matching content types found', async () => {
			const indexContentTypes = await import('#cli/cs/content-types/index.js');
			const indexGlobalFields = await import('#cli/cs/global-fields/index.js');

			vi.mocked(indexContentTypes.default).mockResolvedValue(new Map());
			vi.mocked(indexGlobalFields.default).mockResolvedValue(new Map());

			await clear(mockClient, mockUi, false, ['non_existent']);

			expect(mockUi.warn).toHaveBeenCalledWith(
				'No matching content types found for the specified UIDs.',
			);
		});

		it('should handle multiple content types', async () => {
			const indexContentTypes = await import('#cli/cs/content-types/index.js');
			const indexGlobalFields = await import('#cli/cs/global-fields/index.js');
			const indexEntries = await import('#cli/cs/entries/index.js');

			const mockContentType1: ContentType = {
				title: 'Content Type 1',
				uid: 'ct1',
			} as ContentType;

			const mockContentType2: ContentType = {
				title: 'Content Type 2',
				uid: 'ct2',
			} as ContentType;

			vi.mocked(indexContentTypes.default).mockResolvedValue(
				new Map([
					['ct1', mockContentType1],
					['ct2', mockContentType2],
				]),
			);
			vi.mocked(indexGlobalFields.default).mockResolvedValue(new Map());
			vi.mocked(indexEntries.default).mockResolvedValue(new Map());

			await clear(mockClient, mockUi, false, ['ct1', 'ct2']);

			expect(indexEntries.default).toHaveBeenCalledWith(
				mockClient,
				expect.any(Map),
				mockContentType1,
			);
			expect(indexEntries.default).toHaveBeenCalledWith(
				mockClient,
				expect.any(Map),
				mockContentType2,
			);
		});
	});
});
