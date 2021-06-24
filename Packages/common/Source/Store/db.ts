import {Collection} from "web-vcore/nm/mobx-graphlink";
import {AccessPolicy} from "./db/accessPolicies/@AccessPolicy.js";
import {Layer} from "./db/layers/@Layer";
import {Map_NodeEdit} from "./db/mapNodeEdits/@MapNodeEdit";
import {Map} from "./db/maps/@Map";
import {Media} from "./db/media/@Media";
import {NodeParentChildLink} from "./db/nodeParentChildLinks/@NodeParentChildLink.js";
import {NodeRating} from "./db/nodeRatings/@NodeRating";
import {MapNode} from "./db/nodes/@MapNode";
import {MapNodeRevision} from "./db/nodes/@MapNodeRevision";
import {MapNodeTag} from "./db/nodeTags/@MapNodeTag";
import {Share} from "./db/shares/@Share";
import {Term} from "./db/terms/@Term";
import {User} from "./db/users/@User";
import {User_Private} from "./db/users_private/@User_Private";
import {VisibilityDirective} from "./db/visibilityDirectives/@VisibilityDirective.js";

// manually import these, since otherwise they're never runtime-imported
require("./db/users_private/@User_Private");

declare module "mobx-graphlink/Dist/UserTypes" {
	interface DBShape extends GraphDBShape {}
}

export class GraphDBShape {
	//general: Collection_Closed<{data: GeneralData}>;
	/*modules: Collection_Closed<{
		// feedback: FeedbackDBShape;
	}>;*/

	accessPolicies: Collection<AccessPolicy>;
	visibilityDirectives: Collection<VisibilityDirective>;
	medias: Collection<Media>;
	layers: Collection<Layer>;
	maps: Collection<Map>;
	mapNodeEdits: Collection<Map_NodeEdit>;
	nodes: Collection<MapNode>;
	//nodeExtras: Collection<any>;
	nodeRatings: Collection<NodeRating>;
	nodeRevisions: Collection<MapNodeRevision>;
	//nodeStats: Collection<MapNodeStats>;
	//nodeViewers: Collection<ViewerSet>; // removed due to privacy concerns
	//nodePhrasings: Collection<MapNodePhrasing>;
	nodeParentChildLinks: Collection<NodeParentChildLink>;
	nodeTags: Collection<MapNodeTag>;
	shares: Collection<Share>;
	terms: Collection<Term>;
	//termNames: Collection<any>;
	/*timelines: Collection<Timeline>;
	timelineSteps: Collection<TimelineStep>;*/
	users: Collection<User>;
	users_private: Collection<User_Private>;
	//userMapInfo: Collection<UserMapInfoSet>; // $userID (key) -> $mapID -> layerStates -> $layerID -> [boolean, for whether enabled]
	//userViewedNodes: Collection<ViewedNodeSet>; // removed due to privacy concerns
}

/* export interface FirebaseDBShape {
	modules: Collection_Closed<{
		// feedback: FeedbackDBShape;
	}>;

	general: Collection_Closed<{data: GeneralData}>;
	images: Collection<Image>;
	layers: Collection<Layer>;
	maps: Collection<Map, {
		nodeEditTimes: Collection<NodeEditTimes>,
	}>;
	nodes: Collection<MapNode, {
		ratings: Collection<RatingsRoot>, // $ratingType -> $userID -> value -> $value
		// extras: Collection<any>,
		revisions: Collection<MapNodeRevision>,
		// stats: Collection<MapNodeStats>,
		// viewers: Collection<ViewerSet>, // removed due to privacy concerns
		phrasings: Collection<MapNodePhrasing>,
	}>;
	terms: Collection<Term, {
		components: Collection<TermComponent>,
		names: Collection<any>,
	}>;
	timelines: Collection<Timeline, {
		steps: Collection<TimelineStep>,
	}>;
	users: Collection<User, {
		extras: Collection<UserExtraInfo>,
		mapInfo: Collection<UserMapInfoSet>, // $mapID -> layerStates -> $layerID -> [boolean, for whether enabled]
		// viewedNodes: Collection<ViewedNodeSet>, // removed due to privacy concerns
	}>;
} */

/*export const GetAuth = StoreAccessor(s=>()=>{
	//return s.firelink.userInfo;
	return fire.userInfo;
}) as ()=>FireUserInfo;
export const GetAuth_Raw = StoreAccessor(s=>()=>{
	//return s.firelink.userInfo_raw;
	return fire.userInfo_raw as any;
});*/