import type { Schema } from '#cli/cs/Types.js';
import type Client from '#cli/cs/api/Client.js';
import ContentstackError from '#cli/cs/api/ContentstackError.js';
import type { ContentType } from '#cli/cs/content-types/Types.js';
import type { Entry } from '#cli/cs/entries/Types.js';
import importEntry from '#cli/cs/entries/import.js';
import indexEntries from '#cli/cs/entries/index.js';
import type BeaconReplacer from '#cli/dto/entry/BeaconReplacer.js';
import type Ctx from '#cli/schema/ctx/Ctx.js';
import getUi from '#cli/schema/lib/SchemaUi.js';
import createStylus from '#cli/ui/createStylus.js';
import { isDeepStrictEqual } from 'node:util';
import schemaDirectory from '../schemaDirectory.js';
import loadEntryLocales from './loadEntryLocales.js';

export default function buildCreator(
	ctx: Ctx,
	transformer: BeaconReplacer,
	contentType: ContentType,
) {
	return async (entry: Entry) => {
		const fsLocaleVersions = await loadLocaleVersions(entry, contentType.uid);

		const created = await createFirstLocale(
			ctx,
			transformer,
			contentType,
			fsLocaleVersions,
		);

		await importAdditionalLocales(
			ctx,
			transformer,
			contentType,
			fsLocaleVersions,
			created,
		);

		ctx.references.recordEntryForReferences(contentType.uid, {
			...entry,
			uid: created.uid,
		});
	};
}

async function loadLocaleVersions(entry: Entry, contentTypeUid: string) {
	// entry.title is the base filename (extracted from actual files during indexing)
	// Use it directly instead of sanitizing, since files may contain special chars
	const baseFilename = entry.title;
	const directory = schemaDirectory(contentTypeUid);
	const fsLocaleVersions = await loadEntryLocales(
		directory,
		entry.title,
		baseFilename,
	);

	if (fsLocaleVersions.length === 0) {
		throw new Error(`No locale versions found for entry ${entry.title}.`);
	}

	return fsLocaleVersions;
}

async function createFirstLocale(
	ctx: Ctx,
	transformer: BeaconReplacer,
	contentType: ContentType,
	fsLocaleVersions: Awaited<ReturnType<typeof loadLocaleVersions>>,
): Promise<Entry> {
	const [firstLocale] = fsLocaleVersions;

	if (!firstLocale) {
		throw new Error('No locale versions found');
	}

	const transformed = transformer.process(firstLocale.entry);

	// Pass undefined for 'default' locale (single-locale backward compat)
	const locale =
		firstLocale.locale === 'default' ? undefined : firstLocale.locale;

	try {
		return await importEntry(
			ctx.cs.client,
			contentType.uid,
			transformed,
			false,
			locale,
		);
	} catch (ex) {
		return await handleDuplicateKeyError(
			ex,
			ctx,
			contentType,
			transformed,
			locale,
		);
	}
}

async function handleDuplicateKeyError(
	ex: unknown,
	ctx: Ctx,
	contentType: ContentType,
	transformed: ReturnType<BeaconReplacer['process']>,
	locale: string | undefined,
): Promise<Entry> {
	if (isDuplicateKeyError(ex)) {
		const uid = await getUidByTitle(
			ctx.cs.client,
			ctx.cs.globalFields,
			contentType,
			transformed.title,
		);

		if (!uid) {
			// Title conflicts with an entry in a DIFFERENT content type
			// (Contentstack enforces global title uniqueness across all content types)
			// Create a new entry with the content type name appended for uniqueness
			const ui = getUi();
			const uniqueTitle = `${transformed.title} (${contentType.uid})`;

			ui.warn(
				`Title "${transformed.title}" conflicts globally. ` +
					`Creating with unique title: "${uniqueTitle}"`,
			);

			return await importEntry(
				ctx.cs.client,
				contentType.uid,
				{ ...transformed, title: uniqueTitle },
				false,
				locale,
			);
		}

		// Found an existing entry with this title in the current content type
		// Try to update it
		try {
			return await importEntry(
				ctx.cs.client,
				contentType.uid,
				{ ...transformed, uid },
				true,
				locale,
			);
		} catch (updateEx) {
			// If the update also fails due to title conflict with a different entry,
			// append the UID to make the title unique
			if (isTitleNotUniqueError(updateEx)) {
				const ui = getUi();
				const originalTitle = transformed.title;
				const uniqueTitle = `${originalTitle} [${uid}]`;

				ui.warn(
					`Title "${originalTitle}" conflicts in ${locale ?? 'default'} locale. ` +
						`Using unique title: "${uniqueTitle}"`,
				);

				return await importEntry(
					ctx.cs.client,
					contentType.uid,
					{ ...transformed, title: uniqueTitle, uid },
					true,
					locale,
				);
			}
			throw updateEx;
		}
	}

	throw ex;
}

async function importAdditionalLocales(
	ctx: Ctx,
	transformer: BeaconReplacer,
	contentType: ContentType,
	fsLocaleVersions: Awaited<ReturnType<typeof loadLocaleVersions>>,
	created: Entry,
) {
	// Import all additional locale versions in parallel for better performance
	const importPromises = fsLocaleVersions
		.slice(1)
		.map(async (localeVersion) => {
			if (localeVersion.locale === 'default') {
				// Skip 'default' locale (already handled by first locale)
				return;
			}

			const localeTransformed = transformer.process(localeVersion.entry);

			try {
				return await importEntry(
					ctx.cs.client,
					contentType.uid,
					{ ...localeTransformed, uid: created.uid },
					false,
					localeVersion.locale,
				);
			} catch (ex) {
				if (isLocaleAlreadyExistsError(ex)) {
					// Error 201: locale version already exists, update instead
					try {
						return await importEntry(
							ctx.cs.client,
							contentType.uid,
							{ ...localeTransformed, uid: created.uid },
							true,
							localeVersion.locale,
						);
					} catch (updateEx) {
						// If the update fails with title conflict, make it unique
						if (isTitleNotUniqueError(updateEx)) {
							const ui = getUi();
							const originalTitle = localeTransformed.title as string;
							const uniqueTitle = `${originalTitle} (${contentType.uid})`;

							ui.warn(
								`Title "${originalTitle}" conflicts globally in ${localeVersion.locale} locale. ` +
									`Using unique title: "${uniqueTitle}"`,
							);

							return await importEntry(
								ctx.cs.client,
								contentType.uid,
								{ ...localeTransformed, title: uniqueTitle, uid: created.uid },
								true,
								localeVersion.locale,
							);
						}
						throw updateEx;
					}
				} else if (isTitleNotUniqueError(ex)) {
					// Error 119: title conflicts with another entry
					// Create with content type name appended for uniqueness
					const ui = getUi();
					const originalTitle = localeTransformed.title as string;
					const uniqueTitle = `${originalTitle} (${contentType.uid})`;

					ui.warn(
						`Title "${originalTitle}" conflicts in ${localeVersion.locale} locale. ` +
							`Using unique title: "${uniqueTitle}"`,
					);

					// Try to create first (locale may not exist yet)
					try {
						return await importEntry(
							ctx.cs.client,
							contentType.uid,
							{ ...localeTransformed, title: uniqueTitle, uid: created.uid },
							false,
							localeVersion.locale,
						);
					} catch (createEx) {
						// If locale already exists, update instead
						if (isLocaleAlreadyExistsError(createEx)) {
							return await importEntry(
								ctx.cs.client,
								contentType.uid,
								{ ...localeTransformed, title: uniqueTitle, uid: created.uid },
								true,
								localeVersion.locale,
							);
						}
						throw createEx;
					}
				}
				throw ex;
			}
		});

	await Promise.all(importPromises);
}

function isLocaleAlreadyExistsError(ex: unknown): boolean {
	// Error code 201: Entry already exists in locale
	return ex instanceof ContentstackError && ex.code === 201;
}

function isTitleNotUniqueError(ex: unknown): boolean {
	// Error code 119: Entry import failed with "title is not unique"
	if (!(ex instanceof ContentstackError) || ex.code !== 119) {
		return false;
	}

	return isDeepStrictEqual(ex.details, { title: ['is not unique.'] });
}

function isDuplicateKeyError(ex: unknown) {
	if (!(ex instanceof ContentstackError)) {
		return false;
	}

	// Error code 119: Entry import failed with "title is not unique"
	// Error code 201: Entry already exists in locale
	const invalidDataCode = 119;
	const entryExistsCode = 201;

	if (ex.code === invalidDataCode) {
		return isDeepStrictEqual(ex.details, { title: ['is not unique.'] });
	}

	if (ex.code === entryExistsCode) {
		// Code 201 means entry already exists in the specified locale
		return true;
	}

	return false;
}

async function getUidByTitle(
	client: Client,
	globalFieldsByUid: ReadonlyMap<Schema['uid'], Schema>,
	contentType: ContentType,
	title: string,
) {
	const entries = await indexEntries(client, globalFieldsByUid, contentType);

	// Try exact title first
	let uid = entries.get(title)?.uid;
	if (uid) {
		return uid;
	}

	// Try trimmed title if exact match fails (handles trailing/leading spaces)
	const trimmedTitle = title.trim();
	if (trimmedTitle !== title) {
		uid = entries.get(trimmedTitle)?.uid;
		if (uid) {
			return uid;
		}
	}

	// No match found
	return undefined;
}

function logInvalidState(contentTypeTitle: string, entryTitle: string) {
	const y = createStylus('yellowBright');
	const ui = getUi();
	const msg1 = y`While importing ${contentTypeTitle} entry ${entryTitle},`;
	const msg2 = 'Contentstack reported a duplicate key error based on the';
	const msg3 = 'title, but no entry with that title was found after';
	const msg4 = 're-indexing.';
	const msg = [msg1, msg2, msg3, msg4].join(' ');
	ui.warn(msg);
}
