import {E, ObjectCE} from "web-vcore/nm/js-vextensions.js";
import {AssertV, Command, CommandMeta, UUID} from "web-vcore/nm/mobx-graphlink.js";
import {GetDefaultAccessPolicyID_ForNode} from "../DB/accessPolicies.js";
import {GetMap} from "../DB/maps.js";
import {Map} from "../DB/maps/@Map.js";
import {GetNodeChildLinks} from "../DB/nodeChildLinks.js";
import {GetHolderType, GetNode, GetParentNodeID, GetParentNodeL3} from "../DB/nodes.js";
import {GetNodeL2, GetNodeL3} from "../DB/nodes/$node.js";
import {ClaimForm, MapNode, Polarity} from "../DB/nodes/@MapNode.js";
import {MapNodeRevision} from "../DB/nodes/@MapNodeRevision.js";
import {MapNodeType} from "../DB/nodes/@MapNodeType.js";
import {SearchUpFromNodeForNodeMatchingX} from "../Utils/DB/PathFinder.js";
import {AddChildNode} from "./AddChildNode.js";
import {DeleteNode} from "./DeleteNode.js";
import {LinkNode} from "./LinkNode.js";
import {UnlinkNode} from "./UnlinkNode.js";

type Payload = {
	mapID: string|n, oldParentID: string|n, newParentID: string, nodeID: string,
	newForm?: ClaimForm|n, newPolarity?: Polarity|n,
	createWrapperArg?: boolean,
	//linkAsArgument?: boolean,
	unlinkFromOldParent?: boolean, deleteEmptyArgumentWrapper?: boolean
};

export function CreateLinkCommand(mapID: UUID|n, draggedNodePath: string, dropOnNodePath: string, polarity: Polarity, asCopy: boolean) {
	const draggedNode = GetNodeL3(draggedNodePath);
	const dropOnNode = GetNodeL3(dropOnNodePath);
	if (draggedNode == null || dropOnNode == null) return null;

	// const draggedNode_parent = GetParentNodeL3(draggedNodePath);
	const dropOnNode_parent = GetParentNodeL3(dropOnNodePath);
	const holderType = GetHolderType(dropOnNode.type, dropOnNode_parent?.type);
	const formForClaimChildren = dropOnNode.type == MapNodeType.category ? ClaimForm.yesNoQuestion : ClaimForm.base;

	return new LinkNode_HighLevel({
		mapID, oldParentID: GetParentNodeID(draggedNodePath)!, newParentID: dropOnNode.id, nodeID: draggedNode.id,
		newForm: draggedNode.type == MapNodeType.claim ? formForClaimChildren : null,
		newPolarity: polarity,
		//createWrapperArg: holderType != null || !dropOnNode.multiPremiseArgument,
		createWrapperArg: true, // todo
		unlinkFromOldParent: !asCopy, deleteEmptyArgumentWrapper: true,
	});
}

@CommandMeta({
	payloadSchema: ()=>({}),
	defaultPayload: {createWrapperArg: true},
})
export class LinkNode_HighLevel extends Command<Payload, {argumentWrapperID?: string}> {
	map_data: Map;
	node_data: MapNode;
	newParent_data: MapNode;

	sub_addArgumentWrapper: AddChildNode;
	sub_linkToNewParent: LinkNode;
	sub_unlinkFromOldParent: UnlinkNode;
	sub_deleteOldParent: DeleteNode;
	Validate() {
		let {mapID, oldParentID, newParentID, nodeID, newForm, createWrapperArg, unlinkFromOldParent, deleteEmptyArgumentWrapper, newPolarity} = this.payload;
		AssertV(oldParentID !== nodeID, "Old parent-id and child-id cannot be the same!");
		AssertV(newParentID !== nodeID, "New parent-id and child-id cannot be the same!");
		//AssertV(oldParentID !== newParentID, "Old-parent-id and new-parent-id cannot be the same!");

		this.returnData = {};

		this.map_data = GetMap.NN(mapID);
		this.node_data = GetNodeL2.NN(nodeID);
		const oldParent = GetNodeL2(oldParentID);
		if (oldParentID) AssertV(oldParent, "Old-parent-id was specified, yet no node exists with that ID!");
		this.newParent_data = GetNodeL2.NN(newParentID);

		//let pastingPremiseAsRelevanceArg = IsPremiseOfMultiPremiseArgument(this.node_data, oldParent_data) && createWrapperArg;
		const pastingPremiseAsRelevanceArg = this.node_data.type == MapNodeType.claim && createWrapperArg;
		AssertV(oldParentID !== newParentID || pastingPremiseAsRelevanceArg, "Old-parent-id and new-parent-id cannot be the same! (unless changing between truth-arg and relevance-arg)");
		//AssertV(CanContributeToNode(MeID(), newParentID), "Cannot paste under a node with contributions disabled.");

		// if (command.payload.unlinkFromOldParent && node.parents.VKeys().length == 1 && newParentPath.startsWith(draggedNodePath)) {
		/* if (unlinkFromOldParent && newParentPath.startsWith(draggedNodePath)) {
			return "Cannot move a node to a path underneath itself. (the move could orphan it and its descendants, if the new-parent's only anchoring was through the dragged-node)";
		} */
		if (unlinkFromOldParent) {
			const closestMapRootNode = this.newParent_data.rootNodeForMap ? newParentID : SearchUpFromNodeForNodeMatchingX(newParentID, id=>GetNode(id)?.rootNodeForMap != null, [nodeID]);
			AssertV(closestMapRootNode != null, "Cannot move a node to a path that would orphan it.");
		}

		let newParentID_forClaim = newParentID;

		if (createWrapperArg) {
			const canCreateWrapperArg = this.node_data.type === MapNodeType.claim && ObjectCE(this.newParent_data.type).IsOneOf(MapNodeType.claim, MapNodeType.argument);
			AssertV(canCreateWrapperArg);

			//const createWrapperArg = canCreateWrapperArg && createWrapperArg;
			// Assert(newPolarity, 'Since this command has to create a wrapper-argument, you must supply the newPolarity property.');
			newPolarity = newPolarity || Polarity.supporting; // if new-polarity isn't supplied, just default to Supporting (this can happen if a claim is copied from search-results)
			const argumentWrapper = new MapNode({
				//ownerMapID: OmitIfFalsy(this.newParent_data.ownerMapID),
				accessPolicy: GetDefaultAccessPolicyID_ForNode(),
				type: MapNodeType.argument,
			});
			const argumentWrapperRevision = new MapNodeRevision(this.map_data.nodeDefaults);

			this.sub_addArgumentWrapper = this.sub_addArgumentWrapper ?? new AddChildNode({
				mapID, parentID: newParentID, node: argumentWrapper, revision: argumentWrapperRevision,
				// link: E({ _: true }, newPolarity && { polarity: newPolarity }) as any,
				link: E({_: true, polarity: newPolarity}) as any,
			}).MarkAsSubcommand(this);
			this.sub_addArgumentWrapper.Validate();

			this.returnData.argumentWrapperID = this.sub_addArgumentWrapper.sub_addNode.nodeID;
			newParentID_forClaim = this.sub_addArgumentWrapper.sub_addNode.nodeID;
		}

		this.sub_linkToNewParent = this.sub_linkToNewParent ?? new LinkNode({mapID, parentID: newParentID_forClaim, childID: nodeID, childForm: newForm, childPolarity: newPolarity}).MarkAsSubcommand(this);
		this.sub_linkToNewParent.Validate();

		if (unlinkFromOldParent && oldParent) {
			this.sub_unlinkFromOldParent = this.sub_unlinkFromOldParent ?? new UnlinkNode({mapID, parentID: oldParentID!, childID: nodeID}).MarkAsSubcommand(this);
			this.sub_unlinkFromOldParent.allowOrphaning = true; // allow "orphaning" of nodeID, since we're going to reparent it simultaneously -- using the sub_linkToNewParent subcommand
			this.sub_unlinkFromOldParent.Validate();

			// if the moved node was the parent's only child, and actor allows it (ie. their view has node as single-premise arg), also delete the old parent
			const children = GetNodeChildLinks(oldParentID);
			if (children.length == 1 && deleteEmptyArgumentWrapper) {
				this.sub_deleteOldParent = this.sub_deleteOldParent ?? new DeleteNode({mapID, nodeID: oldParentID!}).MarkAsSubcommand(this);
				this.sub_deleteOldParent.childrenToIgnore = [nodeID]; // let DeleteNode sub that it doesn't need to wait for nodeID to be deleted (since we're moving it out from old-parent simultaneously with old-parent's deletion)
				this.sub_deleteOldParent.Validate();
			}
		}
	}

	DeclareDBUpdates(db) {
		if (this.sub_unlinkFromOldParent) db.add(this.sub_unlinkFromOldParent.GetDBUpdates());
		if (this.sub_deleteOldParent) db.add(this.sub_deleteOldParent.GetDBUpdates());
		if (this.sub_addArgumentWrapper) db.add(this.sub_addArgumentWrapper.GetDBUpdates());
		db.add(this.sub_linkToNewParent.GetDBUpdates());
	}
}