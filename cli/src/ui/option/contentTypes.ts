import { Option } from 'commander';

const contentTypes = new Option(
	'--content-types <types...>',
	'Space-delimited list of content type UIDs to clear entries for',
);

export const defaultValue: string[] = [];

contentTypes.default(defaultValue);

export interface ContentTypesOption {
	readonly contentTypes: string[];
}

export default contentTypes;
