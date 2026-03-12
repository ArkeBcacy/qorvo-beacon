import type Client from '../api/Client.js';
import type Label from './Label.js';

export default async function update(
	client: Client,
	label: Label,
): Promise<void> {
	const { uid, ...rest } = label;

	await client.PUT('/v3/labels/{label_uid}', {
		body: { label: rest },
		params: { path: { label_uid: uid } },
	});
}
