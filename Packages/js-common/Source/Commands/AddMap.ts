import {E} from "web-vcore/nm/js-vextensions.js";
import {AssertV, AssertValidate, Command, CommandMeta, DBHelper, dbp, GenerateUUID, SimpleSchema, UUID} from "web-vcore/nm/mobx-graphlink.js";
import {MapEdit} from "../CommandMacros/MapEdit.js";
import {UserEdit} from "../CommandMacros/UserEdit.js";
import {Map} from "../DB/maps/@Map.js";
import {NodePhrasing} from "../DB/nodePhrasings/@NodePhrasing.js";
import {NodeL1} from "../DB/nodes/@Node.js";
import {NodeRevision} from "../DB/nodes/@NodeRevision.js";
import {NodeType} from "../DB/nodes/@NodeType.js";
import {GetUserHidden} from "../DB/userHiddens.js";
import {AddChildNode} from "./AddChildNode.js";
import {AddNode} from "./AddNode.js";

@UserEdit
@CommandMeta({
	payloadSchema: ()=>SimpleSchema({
		$map: {$ref: "Map"},
	}),
	returnSchema: ()=>SimpleSchema({$id: {$ref: "UUID"}}),
})
export class AddMap extends Command<{map: Map}, {id: UUID}> {
	sub_addNode: AddNode;
	Validate() {
		const {map} = this.payload;
		AssertV(map.featured === undefined, 'Cannot set "featured" to true while first adding a map. (hmmm)');

		map.id = this.GenerateUUID_Once("id");
		map.creator = this.userInfo.id;
		map.createdAt = Date.now();
		map.edits = 0;
		map.editedAt = map.createdAt;

		const userHidden = GetUserHidden.NN(this.userInfo.id);
		const newRootNode = new NodeL1({
			//EV({ownerMapID: OmitIfFalsy(map.type == MapType.Private && this.mapID)}),
			//accessPolicy: GetDefaultAccessPolicyID_ForNode(),
			//accessPolicy: map.nodeAccessPolicy ?? userHidden.lastAccessPolicy,
			accessPolicy: map.accessPolicy, // add-map dialog doesn't let user choose node-access-policy yet, so use the map's accessor policy for the root-node
			type: NodeType.category, creator: map.creator, rootNodeForMap: map.id,
		});
		//const newRootNodeRevision = new NodeRevision(E(map.nodeDefaults, {phrasing: NodePhrasing.Embedded({text_base: "Root"})}));
		const newRootNodeRevision = new NodeRevision({phrasing: NodePhrasing.Embedded({text_base: "Root"})});
		this.IntegrateSubcommand(()=>this.sub_addNode, null, ()=>new AddNode({mapID: map.id, node: newRootNode, revision: newRootNodeRevision}));

		map.rootNode = this.sub_addNode.payload.node.id;
		AssertValidate("Map", map, "Map invalid");

		this.returnData = {id: map.id};
	}

	DeclareDBUpdates(db: DBHelper) {
		const {map} = this.payload;
		db.set(dbp`maps/${map.id}`, map);
		db.add(this.sub_addNode.GetDBUpdates(db)); // add node first, since map has fk-ref to it
	}
}