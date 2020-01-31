import {AddSchema, UUID_regex, GetSchemaJSON, Validate} from "vwebapp-framework";
import {GetValues_ForSchema, ModifyString} from "js-vextensions";
import {Polarity} from "../nodes/@MapNode";

export class MapNodeTag {
	constructor(initialData: Partial<MapNodeTag>) {
		this.VSet(initialData);
	}

	_key?: string;
	creator: string;
	createdAt: number;

	//type: MapNodeTagType;
	//nodes: {[key: string]: string};
	nodes: string[];

	// type-specific fields (ie. tag comps)
	mirrorChildrenFromXToY: TagComp_MirrorChildrenFromXToY;
	mutuallyExclusiveGroup: TagComp_MutuallyExclusiveGroup;
}
AddSchema("MapNodeTag", {
	properties: {
		creator: {type: "string"},
		createdAt: {type: "number"},

		//type: {$ref: "MapNodeTagType"},
		//nodes: {patternProperties: {[UUID_regex]: {type: "string"}}},
		nodes: {items: {$ref: "UUID"}},

		mirrorChildrenFromXToY: {$ref: "TagComp_MirrorChildrenFromXToY"},
		mutuallyExclusiveGroup: {$ref: "TagComp_MutuallyExclusiveGroup"},
	},
	required: ["creator", "createdAt", "nodes"],
});

// tag comps
// ==========

export abstract class TagComp {
	static key: string;
	static displayName: string;
	static description: string;
	static nodeKeys: string[]; // fields whose values should be added to MapNodeTag.nodes array (field-value can be a node-id string, or an array of such strings)

	/** Has side-effect: Casts data to its original class/type. */
	GetFinalTagComps(): TagComp[] {
		let compClass = GetTagCompClassByKey(this["_key"]);
		if (compClass) return [this.As(compClass as any)];
		return [this];
	}
}

/*export class TagComp_ExampleBasedClaim extends TagComp {
	//static key = "exampleBasedClaim";
	static displayName = "example-based claim";
	static description = "Makes-so only arguments of a given polarity can be added; used for claims which default to true/false, in the absense of arguments to the contrary.";
	static nodeKeys = ["nodeX"];

	constructor(initialData?: Partial<TagComp_ExampleBasedClaim>) { super(); this.VSet(initialData); }

	nodeX: string;
	polarityAllowed: Polarity;
}
AddSchema("TagComp_ExampleBasedClaim", {
	properties: {
		nodeX: {$ref: "UUID"},
		polarityAllowed: {$ref: "Polarity"},
	},
});*/

export class TagComp_MirrorChildrenFromXToY extends TagComp {
	//static key = "mirrorChildrenFromXToY";
	static displayName = "mirror children from X to Y";
	static description = "Makes-so any children of node-x (matching the parameters) are shown as children of node-y. (only usable for claims currently)";
	static nodeKeys = ["nodeX", "nodeY"];

	constructor(initialData?: Partial<TagComp_MirrorChildrenFromXToY>) { super(); this.VSet(initialData); }

	nodeX: string;
	nodeY: string;
	mirrorSupporting = true;
	mirrorOpposing = true;
	reversePolarities = false;
	disableDirectChildren = false;
	//overrideDirectChildren = false;
	//recursive = false;
}
AddSchema("TagComp_MirrorChildrenFromXToY", {
	properties: {
		nodeX: {$ref: "UUID"},
		nodeY: {$ref: "UUID"},
		mirrorSupporting: {type: "boolean"},
		mirrorOpposing: {type: "boolean"},
		reversePolarities: {type: "boolean"},
		disableDirectChildren: {type: "boolean"},
	},
});

export class TagComp_MutuallyExclusiveGroup extends TagComp {
	static displayName = "mutually exclusive group (composite)";
	static description = `
		Marks a set of nodes as being mutually exclusive with each other.
		(common use: having each one's pro-args be mirrored as con-args of the others)
	`.AsMultiline(0);
	static nodeKeys = ["nodes"];

	constructor(initialData?: Partial<TagComp_MutuallyExclusiveGroup>) { super(); this.VSet(initialData); }

	nodes = [] as string[];
	mirrorXProsAsYCons = true;

	GetFinalTagComps() {
		let result = super.GetFinalTagComps();
		if (this.mirrorXProsAsYCons) {
			for (let nodeX of this.nodes) {
				for (let nodeY of this.nodes.Except(nodeX)) {
					let mirrorComp = new TagComp_MirrorChildrenFromXToY({
						nodeX, nodeY,
						mirrorSupporting: true,
						mirrorOpposing: false,
						reversePolarities: true,
					});
					result.push(mirrorComp);
				}
			}
		}
		return result;
	}
}
AddSchema("TagComp_MutuallyExclusiveGroup", {
	properties: {
		nodes: {items: {$ref: "UUID"}},
		mirrorXProsAsYCons: {type: "boolean"},
	},
});

// tag comp meta
// ==========

export const TagComp_classes = [
	TagComp_MirrorChildrenFromXToY,
	TagComp_MutuallyExclusiveGroup,
] as const;
export type TagComp_Class = typeof TagComp_classes[number];
CalculateTagCompClassStatics();
export const TagComp_keys = TagComp_classes.map(c=>c.key);
export const TagComp_names = TagComp_classes.map(c=>c.displayName);

// use class-names to calculate keys and display-names
function CalculateTagCompClassStatics() {
	for (const compClass of TagComp_classes) {
		compClass.key = compClass.key ?? CalculateTagCompKey(compClass.name);
		compClass.displayName = compClass.displayName ?? CalculateTagCompDisplayName(compClass.name);
	}
}

export function CalculateTagCompKey(className: string) {
	//return GetSchemaJSON("MapNodeTag").properties.Pairs().find(a=>a.value.$ref == className).key;
	let displayName = className.replace(/TagComp_/, "");
	displayName = ModifyString(displayName, m=>[m.startUpper_to_lower]);
	return displayName;
}
export function GetTagCompClassByKey(key: string) {
	return TagComp_classes.find(a=>a.key == key);
}
export function CalculateTagCompDisplayName(className: string) {
	const autoSlotNames = ["x", "y", "z"];
	let displayName = className.replace(/TagComp_/, "");
	displayName = ModifyString(displayName, m=>[m.startUpper_to_lower, m.lowerUpper_to_lowerSpaceLower]);
	for (const slotName of autoSlotNames) {
		displayName = displayName.replace(new RegExp(`(^| )${slotName}( |$)`), slotName.toUpperCase());
	}
	return displayName;
}
export function GetTagCompClassByDisplayName(displayName: string) {
	return TagComp_classes.find(a=>a.displayName == displayName);
}
export function GetTagCompClassByTag(tag: MapNodeTag) {
	return TagComp_classes.find(a=>a.key in tag);
}
export function GetTagCompOfTag(tag: MapNodeTag): TagComp {
	let compClass = GetTagCompClassByTag(tag);
	return tag[compClass.key];
}

/*export type MapNodeTagType = typeof TagComp_classes[number];
export const MapNodeTagType_values = ["mirror children from X to Y"] as const; //, "example-based claim", "X extends Y"];
//AddSchema("MapNodeTagType", {oneOf: MapNodeTagType_values.map(val=>({const: val}))});
export const MapNodeTagType_keys = MapNodeTagType_values.map(type=>ConvertNodeTagTypeToKey(type));
export function ConvertNodeTagTypeToKey(type: MapNodeTagType) {
	return ModifyString(type, m=>[m.spaceLower_to_spaceUpper, m.removeSpaces, m.hyphenLower_to_hyphenUpper, m.removeHyphens]);
}
export function GetNodeTagKey(tag: MapNodeTag) {
	return MapNodeTagType_keys.find(key=>key in tag);
}
export function GetNodeTagType(tag: MapNodeTag) {
	const compKeyIndex = MapNodeTagType_keys.findIndex(key=>key in tag);
	return MapNodeTagType_values[compKeyIndex];
}*/

export function CalculateNodeIDsForTagComp(tagComp: TagComp, compClass: TagComp_Class) {
	/*let compClass = GetTagCompClassByTag(tag);
	let comp = GetTagCompOfTag(tag);*/
	//let compClass = GetTagCompClassByKey(tagComp["_key"]);
	return compClass.nodeKeys.SelectMany(key=> {
		let nodeKeyValue = tagComp[key];
		let nodeIDsForKey = Array.isArray(nodeKeyValue) ? nodeKeyValue : [nodeKeyValue];
		return nodeIDsForKey.filter(nodeID=>Validate("UUID", nodeID) == null);
	});
}