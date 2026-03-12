import type Client from '../api/Client.js';
import type Label from './Label.js';

export default async function importLabel(
	client: Client,
	label: Omit<Label, 'uid'>,
): Promise<Label['uid']> {
	const { data } = await client.POST('/v3/labels', {
		body: { label },
	});

	const result = data as unknown;
	const uid =
		result &&
		typeof result === 'object' &&
		'label' in result &&
		result.label &&
		typeof result.label === 'object' &&
		'uid' in result.label
			? result.label.uid
			: undefined;

	if (typeof uid !== 'string') {
		throw new Error('Failed to import label');
	}

	return uid;
}
