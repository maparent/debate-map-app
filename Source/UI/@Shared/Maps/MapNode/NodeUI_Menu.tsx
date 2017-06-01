import DeleteNode from "../../../../Server/Commands/DeleteNode";
import {GetDataAsync, RemoveHelpers} from "../../../../Frame/Database/DatabaseHelpers";
import {MapNode, MapNodeEnhanced} from "../../../../Store/firebase/nodes/@MapNode";
import {PermissionGroupSet} from "../../../../Store/firebase/userExtras/@UserExtraInfo";
import {VMenuStub} from "react-vmenu";
import {MapNodeType, MapNodeType_Info, GetMapNodeTypeDisplayName} from "../../../../Store/firebase/nodes/@MapNodeType";
import {GetUserID, GetUserPermissionGroups} from "../../../../Store/firebase/users";
import {RootState} from "../../../../Store";
import VMenu from "react-vmenu";
import {BaseComponent, Pre, Div} from "../../../../Frame/UI/ReactGlobals";
import {ShowMessageBox} from "../../../../Frame/UI/VMessageBox";
import {WaitXThenRun} from "../../../../Frame/General/Timers";
import TextInput from "../../../../Frame/ReactComponents/TextInput";
import {styles} from "../../../../Frame/UI/GlobalStyles";
import {DataSnapshot} from "firebase";
import {DN, Debugger} from "../../../../Frame/General/Globals";
import * as keycode from "keycode";
import {firebaseConnect} from "react-redux-firebase";
import {connect} from "react-redux";
import {ACTNodeCopy} from "../../../../Store/main";
import Select from "../../../../Frame/ReactComponents/Select";
import {GetEntries, GetValues} from "../../../../Frame/General/Enums";
import {VMenuItem} from "react-vmenu/dist/VMenu";
import {ForDelete_GetError, ForUnlink_GetError, GetNode, GetNodeChildrenAsync, GetNodeParentsAsync, GetParentNode, IsLinkValid, IsNewLinkValid} from "../../../../Store/firebase/nodes";
import {Connect} from "../../../../Frame/Database/FirebaseConnect";
import {SignInPanel, ShowSignInPopup} from "../../NavBar/UserPanel";
import {IsUserBasicOrAnon, IsUserCreatorOrMod} from "../../../../Store/firebase/userExtras";
import {ThesisForm} from "../../../../Store/firebase/nodes/@MapNode";
import {ShowAddChildDialog} from "./NodeUI_Menu/AddChildDialog";
import {GetNodeChildren} from "../../../../Store/firebase/nodes";
import {E} from "../../../../Frame/General/Globals_Free";
import AddNode from "../../../../Server/Commands/AddNode";
import {GetNodeDisplayText, GetValidNewChildTypes, GetNodeForm, ReverseMapNodeType, IsReversedArgumentNode, GetNodeEnhanced} from "../../../../Store/firebase/nodes/$node";
import {Map} from "../../../../Store/firebase/maps/@Map";
import { SlicePath } from "./NodeUI/RatingsPanel";
import LinkNode from "Server/Commands/LinkNode";
import UnlinkNode from "Server/Commands/UnlinkNode";
import CloneNode from "Server/Commands/CloneNode";

type Props = {map: Map, node: MapNodeEnhanced, path: string} & Partial<{permissions: PermissionGroupSet, parentNode: MapNodeEnhanced, copiedNode: MapNode}>;
@Connect((_: RootState, {node, path}: Props)=> {
	let pathNodeIDs = path.split("/").Select(a=>parseInt(a));
	return {
		_: (ForUnlink_GetError(GetUserID(), node), ForDelete_GetError(GetUserID(), node)),
		//userID: GetUserID(), // not needed in Connect(), since permissions already watches its data
		permissions: GetUserPermissionGroups(GetUserID()),
		parentNode: GetNodeEnhanced(GetParentNode(path), SlicePath(path, 1)),
		copiedNode: State(a=>a.main.copiedNodePath) ? GetNode(State(a=>a.main.copiedNodePath).split("/").Last().ToInt()) : null,
	};
})
export default class NodeUI_Menu extends BaseComponent<Props, {}> {
	render() {
		let {map, node, path, permissions, parentNode, copiedNode} = this.props;
		let userID = GetUserID();
		let firebase = store.firebase.helpers;
		//let validChildTypes = MapNodeType_Info.for[node.type].childTypes;
		let validChildTypes = GetValidNewChildTypes(node, path, permissions);
		let form = GetNodeForm(node, path);
		let formForChildren = node.type == MapNodeType.Category ? ThesisForm.YesNoQuestion : ThesisForm.Base;

		let nodeText = GetNodeDisplayText(node, path);

		return (
			<VMenuStub preOpen={e=>e.passThrough != true}>
				{IsUserBasicOrAnon(userID) && validChildTypes.map(childType=> {
					let childTypeInfo = MapNodeType_Info.for[childType];
					//let displayName = GetMapNodeTypeDisplayName(childType, node, form);
					let displayName = GetMapNodeTypeDisplayName(childType, node, ThesisForm.Base);
					return (
						<VMenuItem key={childType} text={`Add ${displayName}`} style={styles.vMenuItem} onClick={e=> {
							if (e.button != 0) return;
							if (userID == null) return ShowSignInPopup();
							
							let childType_real = childType;
							if (GetNodeForm(node) == ThesisForm.Negation)
								childType_real = ReverseMapNodeType(childType_real);
							ShowAddChildDialog(node, form, childType_real, userID, map._id, path);
						}}/>
					);
				})}
				{IsUserBasicOrAnon(userID) && node.metaThesis == null &&
					//<VMenuItem text={copiedNode ? "Copy (right-click to clear)" : "Copy"} style={styles.vMenuItem}
					<VMenuItem text={copiedNode ? <span>Copy <span style={{fontSize: 10, opacity: .7}}>(right-click to clear)</span></span> as any : `Copy`} style={styles.vMenuItem}
						onClick={e=> {
							e.persist();
							if (e.button == 0) {
								store.dispatch(new ACTNodeCopy({path}));
							} else {
								store.dispatch(new ACTNodeCopy({path: null}));
							}
						}}/>}
				{IsUserBasicOrAnon(userID) && copiedNode && IsNewLinkValid(node, path, copiedNode, permissions) &&
					<VMenuItem text={`Paste as link: "${GetNodeDisplayText(copiedNode, formForChildren).KeepAtMost(50)}"`} style={styles.vMenuItem} onClick={e=> {
						if (e.button != 0) return;
						if (userID == null) return ShowSignInPopup();
						if (copiedNode.type == MapNodeType.SupportingArgument || copiedNode.type == MapNodeType.OpposingArgument) {
							return void ShowMessageBox({title: `Argument at two locations?`, cancelButton: true, onOK: proceed, message:
`Are you sure you want to paste this argument as a linked child?

Only do this if you're sure that the meta-thesis applies exactly the same to both the old parent and the new parent.${``
} (usually it does not, ie. usually it's specific to its original parent thesis)

If not, paste the argument as a clone instead.`
							});
						}
						proceed();
						function proceed() {
							new LinkNode({parentID: node._id, childID: copiedNode._id, childForm: formForChildren}).Run();
						}
					}}/>}
				{IsUserBasicOrAnon(userID) && copiedNode && IsNewLinkValid(node, path, copiedNode.Extended({_id: -1}), permissions) &&
					<VMenuItem text={`Paste as clone: "${GetNodeDisplayText(copiedNode, formForChildren).KeepAtMost(50)}"`} style={styles.vMenuItem} onClick={async e=> {
						if (e.button != 0) return;
						if (userID == null) return ShowSignInPopup();

						let baseNodePath = State(a=>a.main.copiedNodePath);						
						new CloneNode({baseNodePath, newParentID: node._id}).Run();
					}}/>}
				{IsUserCreatorOrMod(userID, node) &&
					<VMenuItem text="Unlink" enabled={ForUnlink_GetError(userID, node) == null} title={ForUnlink_GetError(userID, node)}
						style={styles.vMenuItem} onClick={async e=> {
							if (e.button != 0) return;
							/*let error = ForUnlink_GetError(userID, node);
							if (error) {
								return void ShowMessageBox({title: `Cannot unlink`, message: error});
							}*/
							
							/*let parentNodes = await GetNodeParentsAsync(node);
							if (parentNodes.length <= 1) {*/
							/*if (node.parents.VKeys(true).length <= 1) {
								return void ShowMessageBox({title: `Cannot unlink`, message: `Cannot unlink this child, as doing so would orphan it. Try deleting it instead.`});
							}*/

							//let parent = parentNodes[0];
							let parentText = GetNodeDisplayText(parentNode, path.substr(0, path.lastIndexOf(`/`)));
							ShowMessageBox({
								title: `Unlink child "${nodeText}"`, cancelButton: true,
								message: `Unlink the child "${nodeText}" from its parent "${parentText}"?`,
								onOK: ()=> {
									new UnlinkNode({parentID: parentNode._id, childID: node._id}).Run();
								}
							});
						}}/>}
				{IsUserCreatorOrMod(userID, node) &&
					<VMenuItem text="Delete" enabled={ForDelete_GetError(userID, node) == null} title={ForDelete_GetError(userID, node)}
						style={styles.vMenuItem} onClick={e=> {
							if (e.button != 0) return;
							/*let error = ForDelete_GetError(userID, node);
							if (error) {
								return void ShowMessageBox({title: `Cannot delete`, message: error});
							}*/

							//let parentNodes = await GetNodeParentsAsync(node);
							/*if (node.parents.VKeys(true).length > 1) {
								return void ShowMessageBox({title: `Cannot delete`, message: `Cannot delete this child, as it has more than one parent. Try unlinking it instead.`});
							}*/
							//let s_ifParents = parentNodes.length > 1 ? "s" : "";
							let metaThesisID = node.type == MapNodeType.SupportingArgument || node.type == MapNodeType.OpposingArgument ? node.children.VKeys()[0] : null;

							ShowMessageBox({
								title: `Delete "${nodeText}"`, cancelButton: true,
								/*message: `Delete the node "${nodeText}"`
									+ `${metaThesisID ? ", its 1 meta-thesis" : ""}`
									+ `, and its link${s_ifParents} with ${parentNodes.length} parent${s_ifParents}?`,*/
								message: `Delete the node "${nodeText}"${metaThesisID ? `, its 1 meta-thesis` : ``}, and its link with 1 parent?`,
								onOK: ()=> {
									new DeleteNode({nodeID: node._id}).Run();
								}
							});
						}}/>}
			</VMenuStub>
		);
	}
}