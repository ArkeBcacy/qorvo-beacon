import type Client from '#cli/cs/api/Client.js';
import deleteLabel from '#cli/cs/labels/delete.js';
import importLabel from '#cli/cs/labels/import.js';
import type Label from '#cli/cs/labels/Label.js';
import updateLabel from '#cli/cs/labels/update.js';
import type NormalizedLabel from '#cli/dto/label/NormalizedLabel.js';
import toCs from '#cli/dto/label/toCs.js';
import type LabelCollection from './LabelCollection.js';

export default class CsLabelCollection implements LabelCollection {
	readonly #labels: Map<Label['uid'], NormalizedLabel>;

	public constructor(
		private readonly client: Client,
		labels: ReadonlyMap<Label['uid'], NormalizedLabel>,
	) {
		this.#labels = new Map(labels);
	}

	public get byUid(): ReadonlyMap<Label['uid'], NormalizedLabel> {
		return this.#labels;
	}

	public async create(normalized: NormalizedLabel): Promise<void> {
		const { uid, ...rest } = toCs(normalized);
		await importLabel(this.client, rest);
		this.#labels.set(normalized.label.uid, normalized);
	}

	public async remove(normalized: NormalizedLabel): Promise<void> {
		await deleteLabel(this.client, normalized.label.uid);
		this.#labels.delete(normalized.label.uid);
	}

	public async update(normalized: NormalizedLabel): Promise<void> {
		const existing = this.#labels.get(normalized.label.uid);

		if (!existing) {
			throw new Error(`Label ${normalized.label.uid} does not exist`);
		}

		await updateLabel(this.client, toCs(normalized));

		this.#labels.set(normalized.label.uid, normalized);
	}
}
