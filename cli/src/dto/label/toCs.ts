import type Label from '../../cs/labels/Label.js';
import type NormalizedLabel from './NormalizedLabel.js';

export default function toCs(
	normalized: NormalizedLabel,
	uid?: string,
): Label | Omit<Label, 'uid'> {
	const { name, parent, content_types } = normalized.label;

	const base = {
		name,
		...(parent && parent.length > 0 ? { parent } : {}),
		...(content_types && content_types.length > 0 ? { content_types } : {}),
	};

	return uid ? { ...base, uid } : base;
}
