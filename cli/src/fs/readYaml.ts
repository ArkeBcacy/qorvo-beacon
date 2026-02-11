import type { PathLike } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';

export default async function readYaml(pathLike: PathLike): Promise<unknown> {
	// Read as buffer first to detect encoding
	const buffer = await readFile(pathLike);

	// Check for UTF-16 LE BOM (FF FE)
	let raw: string;
	if (buffer[0] === 0xff && buffer[1] === 0xfe) {
		raw = buffer.toString('utf16le');
	}
	// Check for UTF-16 BE BOM (FE FF)
	else if (buffer[0] === 0xfe && buffer[1] === 0xff) {
		// Note: Node.js doesn't have built-in utf16be, so we swap bytes
		const swapped = Buffer.alloc(buffer.length);
		for (let i = 0; i < buffer.length; i += 2) {
			const byte1 = buffer[i + 1];
			const byte2 = buffer[i];
			if (byte1 !== undefined) swapped[i] = byte1;
			if (byte2 !== undefined) swapped[i + 1] = byte2;
		}
		raw = swapped.toString('utf16le');
	}
	// Default to UTF-8
	else {
		raw = buffer.toString('utf-8');
	}

	return parse(raw);
}
