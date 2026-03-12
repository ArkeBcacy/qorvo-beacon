import type Client from '../api/Client.js';
import type Label from './Label.js';
import { isLabel } from './Label.js';

export default async function exportLabel(
	client: Client,
	labelUid: string,
): Promise<Label> {
	const { data } = await client.GET('/v3/labels/{label_uid}', {
		params: {
			path: { label_uid: labelUid },
		},
	});

	const result = data as unknown;

	if (!isValidLabelResponse(result)) {
		throw new Error(`Invalid label response for ${labelUid}`);
	}

	return result.label;
}

function isValidLabelResponse(
	o: unknown,
): o is Record<string, unknown> & { label: Label } {
	return (
		typeof o === 'object' &&
		o !== null &&
		'label' in o &&
		o.label !== null &&
		isLabel(o.label)
	);
}
