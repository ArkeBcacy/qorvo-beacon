import { describe, expect, it } from 'vitest';
import type Label from '../../cs/labels/Label.js';
import fromCs from './fromCs.js';
import { isNormalizedLabel, key } from './NormalizedLabel.js';
import toCs from './toCs.js';

describe('NormalizedLabel', () => {
	describe('fromCs', () => {
		it('should transform a label from Contentstack format', () => {
			const csLabel: Label = {
				content_types: ['page_general_page', 'page_article_page'],
				name: 'Page',
				uid: 'blt0d1abc79e3a6965f',
			};

			const normalized = fromCs(csLabel);

			expect(normalized.label.name).toBe('Page');
			expect(normalized.label.uid).toBeUndefined();
			expect(normalized.label.content_types).toEqual([
				'page_general_page',
				'page_article_page',
			]);
		});

		it('should omit empty arrays', () => {
			const csLabel: Label = {
				content_types: [],
				name: 'Empty Label',
				parent: [],
				uid: 'blt1234567890abcdef',
			};

			const normalized = fromCs(csLabel);

			expect(normalized.label.content_types).toBeUndefined();
			expect(normalized.label.parent).toBeUndefined();
		});
	});

	describe('toCs', () => {
		it('should convert normalized label to CS format without UID', () => {
			const normalized = {
				label: {
					content_types: ['component_hero', 'component_cta'],
					name: 'Component',
				},
			};

			const csLabel = toCs(normalized);

			expect(csLabel.name).toBe('Component');
			expect('uid' in csLabel).toBe(false);
			expect(csLabel.content_types).toEqual([
				'component_hero',
				'component_cta',
			]);
		});

		it('should include UID when provided', () => {
			const normalized = {
				label: {
					content_types: ['component_hero'],
					name: 'Component',
				},
			};

			const csLabel = toCs(normalized, 'blt9876543210fedcba');

			expect(csLabel.name).toBe('Component');
			expect((csLabel as Label).uid).toBe('blt9876543210fedcba');
		});
	});

	describe('key', () => {
		it('should use name as the key', () => {
			const normalized = {
				label: {
					content_types: ['test_type'],
					name: 'Test Label',
				},
			};

			expect(key(normalized)).toBe('Test Label');
		});
	});

	describe('isNormalizedLabel', () => {
		it('should accept valid label without UID', () => {
			const value = {
				label: {
					content_types: ['type1', 'type2'],
					name: 'Valid Label',
				},
			};

			expect(isNormalizedLabel(value)).toBe(true);
		});

		it('should accept valid label with UID', () => {
			const value = {
				label: {
					content_types: ['type1'],
					name: 'Valid Label',
					uid: 'blt1234567890abcdef',
				},
			};

			expect(isNormalizedLabel(value)).toBe(true);
		});

		it('should reject invalid label', () => {
			const value = {
				label: {
					content_types: ['type1'],
				},
			};

			expect(isNormalizedLabel(value)).toBe(false);
		});
	});
});
