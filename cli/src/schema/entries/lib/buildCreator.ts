/* eslint-disable max-lines */
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
import { isDeepStrictEqual } from 'node:util';
import schemaDirectory from '../schemaDirectory.js';
import loadEntryLocales from './loadEntryLocales.js';

// Contentstack error codes
const ERROR_CODE_TITLE_NOT_UNIQUE = 119;
const ERROR_CODE_ENTRY_ALREADY_EXISTS = 201;

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

async function createEntryWithGloballyUniqueTitle(
	ctx: Ctx,
	contentType: ContentType,
	transformed: ReturnType<BeaconReplacer['process']>,
	locale: string | undefined,
): Promise<Entry> {
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

async function updateExistingEntry(
	ctx: Ctx,
	contentType: ContentType,
	transformed: ReturnType<BeaconReplacer['process']>,
	uid: string,
	locale: string | undefined,
): Promise<Entry> {
	try {
		return await importEntry(
			ctx.cs.client,
			contentType.uid,
			{ ...transformed, uid },
			true,
			locale,
		);
	} catch (updateEx) {
		if (isTitleNotUniqueError(updateEx)) {
			const ui = getUi();
			const uniqueTitle = `${transformed.title} [${uid}]`;

			ui.warn(
				`Title "${transformed.title}" conflicts in ${locale ?? 'default'} locale. ` +
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
			return await createEntryWithGloballyUniqueTitle(
				ctx,
				contentType,
				transformed,
				locale,
			);
		}

		return await updateExistingEntry(
			ctx,
			contentType,
			transformed,
			uid,
			locale,
		);
	}

	throw ex;
}

async function handleLocaleImportError(
	ex: unknown,
	ctx: Ctx,
	contentType: ContentType,
	localeTransformed: ReturnType<BeaconReplacer['process']>,
	createdUid: string,
	locale: string,
): Promise<Entry | undefined> {
	if (isLocaleAlreadyExistsError(ex)) {
		return await handleLocaleExistsError(
			ctx,
			contentType,
			localeTransformed,
			createdUid,
			locale,
		);
	}

	if (isTitleNotUniqueError(ex)) {
		return await handleTitleNotUniqueInLocale(
			ctx,
			contentType,
			localeTransformed,
			createdUid,
			locale,
		);
	}

	throw ex;
}

async function handleLocaleExistsError(
	ctx: Ctx,
	contentType: ContentType,
	localeTransformed: ReturnType<BeaconReplacer['process']>,
	createdUid: string,
	locale: string,
): Promise<Entry> {
	try {
		return await importEntry(
			ctx.cs.client,
			contentType.uid,
			{ ...localeTransformed, uid: createdUid },
			true,
			locale,
		);
	} catch (updateEx) {
		if (isTitleNotUniqueError(updateEx)) {
			const ui = getUi();
			const uniqueTitle = `${localeTransformed.title} (${contentType.uid})`;

			ui.warn(
				`Title "${localeTransformed.title}" conflicts globally in ${locale} locale. ` +
					`Using unique title: "${uniqueTitle}"`,
			);

			return await importEntry(
				ctx.cs.client,
				contentType.uid,
				{ ...localeTransformed, title: uniqueTitle, uid: createdUid },
				true,
				locale,
			);
		}
		throw updateEx;
	}
}

async function handleTitleNotUniqueInLocale(
	ctx: Ctx,
	contentType: ContentType,
	localeTransformed: ReturnType<BeaconReplacer['process']>,
	createdUid: string,
	locale: string,
): Promise<Entry> {
	const ui = getUi();
	const uniqueTitle = `${localeTransformed.title} (${contentType.uid})`;

	ui.warn(
		`Title "${localeTransformed.title}" conflicts in ${locale} locale. ` +
			`Using unique title: "${uniqueTitle}"`,
	);

	try {
		return await importEntry(
			ctx.cs.client,
			contentType.uid,
			{ ...localeTransformed, title: uniqueTitle, uid: createdUid },
			false,
			locale,
		);
	} catch (createEx) {
		if (isLocaleAlreadyExistsError(createEx)) {
			return await importEntry(
				ctx.cs.client,
				contentType.uid,
				{ ...localeTransformed, title: uniqueTitle, uid: createdUid },
				true,
				locale,
			);
		}
		throw createEx;
	}
}

async function importLocaleVersion(
	ctx: Ctx,
	transformer: BeaconReplacer,
	contentType: ContentType,
	localeVersion: { locale: string; entry: Entry },
	createdUid: string,
): Promise<Entry | undefined> {
	if (localeVersion.locale === 'default') {
		return;
	}

	const localeTransformed = transformer.process(localeVersion.entry);

	try {
		return await importEntry(
			ctx.cs.client,
			contentType.uid,
			{ ...localeTransformed, uid: createdUid },
			false,
			localeVersion.locale,
		);
	} catch (ex) {
		return await handleLocaleImportError(
			ex,
			ctx,
			contentType,
			localeTransformed,
			createdUid,
			localeVersion.locale,
		);
	}
}

async function importAdditionalLocales(
	ctx: Ctx,
	transformer: BeaconReplacer,
	contentType: ContentType,
	fsLocaleVersions: Awaited<ReturnType<typeof loadLocaleVersions>>,
	created: Entry,
) {
	const importPromises = fsLocaleVersions
		.slice(1)
		.map(async (localeVersion) =>
			importLocaleVersion(
				ctx,
				transformer,
				contentType,
				localeVersion,
				created.uid,
			),
		);

	await Promise.all(importPromises);
}

function isLocaleAlreadyExistsError(ex: unknown): boolean {
	// Error code 201: Entry already exists in locale
	return (
		ex instanceof ContentstackError &&
		ex.code === ERROR_CODE_ENTRY_ALREADY_EXISTS
	);
}

function isTitleNotUniqueError(ex: unknown): boolean {
	// Error code 119: Entry import failed with "title is not unique"
	if (
		!(ex instanceof ContentstackError) ||
		ex.code !== ERROR_CODE_TITLE_NOT_UNIQUE
	) {
		return false;
	}

	return isDeepStrictEqual(ex.details, { title: ['is not unique.'] });
}

function isDuplicateKeyError(ex: unknown) {
	if (!(ex instanceof ContentstackError)) {
		return false;
	}

	if (ex.code === ERROR_CODE_TITLE_NOT_UNIQUE) {
		return isDeepStrictEqual(ex.details, { title: ['is not unique.'] });
	}

	if (ex.code === ERROR_CODE_ENTRY_ALREADY_EXISTS) {
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
