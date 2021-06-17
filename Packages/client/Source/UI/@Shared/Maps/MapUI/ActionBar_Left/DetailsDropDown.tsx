import {GetAsync} from "web-vcore/nm/mobx-graphlink";
import {Button, Column, DropDown, DropDownContent, DropDownTrigger, Row, CheckBox, Text} from "web-vcore/nm/react-vcomponents";
import {BaseComponent} from "web-vcore/nm/react-vextensions";
import {ShowMessageBox} from "web-vcore/nm/react-vmessagebox";
import {store} from "Store";
import {MapNodeRevision_Defaultable, CanEditNode, IsUserCreatorOrMod, MeID, GetNodeL2, AddNodeRevision, SetMapFeatured, UpdateMapDetails, GetChildCount, DeleteMap, Map} from "dm_common";


import {Observer, GetUpdates, InfoButton} from "web-vcore";
import {GADDemo} from "UI/@GAD/GAD";
import {Button_GAD} from "UI/@GAD/GADButton";


import {runInAction} from "web-vcore/nm/mobx";
import {FromJSON, ToJSON, E} from "web-vcore/nm/js-vextensions";

import {MapDetailsUI} from "../../MapDetailsUI";

// todo: probably ms this runs in two steps: 1) gets db-updates, 2) user looks over and approves, 3) user presses continue (to apply using ApplyDBUpdates, or a composite command)
export async function ApplyNodeDefaults(nodeID: string, nodeDefaults: MapNodeRevision_Defaultable, recursive: boolean, mapID: string, runInfo = {revisionsUpdated: new Set<string>()}) {
	if (!CanEditNode(MeID(), nodeID)) return;
	const node = await GetAsync(()=>GetNodeL2(nodeID));
	if (runInfo.revisionsUpdated.has(node.currentRevision)) return;

	const oldJSON = ToJSON(node.current);
	const newRevision = E(FromJSON(oldJSON), nodeDefaults);
	const newJSON = ToJSON(newRevision);
	if (newJSON != oldJSON) {
		const updateCommand = new AddNodeRevision({mapID, revision: newRevision});
		await updateCommand.Run();
		runInfo.revisionsUpdated.add(node.currentRevision);
	}

	if (recursive && node.children) {
		for (const childID of node.children.VKeys()) {
			await	ApplyNodeDefaults(childID, nodeDefaults, true, mapID, runInfo);
		}
		// apply for all children paths in parallel (to be used in future)
		//await	Promise.all(node.children.VKeys().map(childID=>ApplyNodeDefaults(childID, nodeDefaults, true, mapID, runInfo)));
	}

	return runInfo;
}

@Observer
export class DetailsDropDown extends BaseComponent<{map: Map}, {dataError: string}> {
	detailsUI: MapDetailsUI;
	// permOptions: PermissionsOptions;
	render() {
		const {map} = this.props;
		const {dataError} = this.state;

		const Button_Final = GADDemo ? Button_GAD : Button;
		const creatorOrMod = IsUserCreatorOrMod(MeID(), map);

		const setMapFeaturedCommand = new SetMapFeatured({id: map._key, featured: !map.featured});

		return (
			<DropDown>
				<DropDownTrigger><Button_Final ml={5} style={{height: "100%"}} text="Details"/></DropDownTrigger>
				<DropDownContent style={{left: 0, borderRadius: "0 0 5px 0"}}><Column>
					<MapDetailsUI ref={c=>this.detailsUI = c} baseData={map}
						forNew={false} enabled={creatorOrMod}
						onChange={newData=>{
							this.SetState({dataError: this.detailsUI.GetValidationError()});
						}}/>
					{creatorOrMod &&
						<Row>
							<Button mt={5} text="Save" enabled={dataError == null} title={dataError} onLeftClick={async()=>{
								const mapUpdates = GetUpdates(map, this.detailsUI.GetNewData()).Excluding("layers", "timelines");
								await new UpdateMapDetails({id: map._key, updates: mapUpdates}).Run();
							}}/>
						</Row>}
					{creatorOrMod &&
						<Column mt={10}>
							<Row style={{fontWeight: "bold"}}>Advanced:</Row>
							<Row mt={5} center>
								<CheckBox text="Featured" enabled={setMapFeaturedCommand.Validate_Safe() == null} title={setMapFeaturedCommand.validateError} value={map.featured} onChange={val=>{
									setMapFeaturedCommand.Run();
								}}/>
							</Row>
							<Row center>
								<Text>Actions:</Text>
								<Button ml={5} text="Apply node-defaults" onLeftClick={async()=>{
									ShowMessageBox({
										title: "Recursively apply node-defaults", cancelButton: true,
										message: `
											Recursively apply node-defaults, for nodes within the map "${map.name}"?

											Notes:
											* Recurses down from the root node, modifying non-matching nodes to match the node-defaults; ignores paths where we lack the edit permission.
											* The process may take quite a while (depending on the map size). A message will display on completion.
											* There is no user-interface yet to stop the operation; closing the browser tab will accomplish this, though.
											* You cannot directly undo the operation. (though if the previous node settings were all the same, you could rerun this tool)
										`.AsMultiline(0),
										onOK: async()=>{
											const runInfo = await ApplyNodeDefaults(map.rootNode, map.nodeDefaults, true, map._key);
											ShowMessageBox({title: "Done", message: `
												Finished applying the node-defaults.

												Node update-count: ${runInfo.revisionsUpdated.size}
											`.AsMultiline(0)});
										},
									});
								}}/>
								<InfoButton ml={5} text="Recurses down from the root node, modifying non-matching nodes to match the node-defaults; ignores paths where we lack the edit permission."/>
								<Button ml={5} text="Delete" onLeftClick={async()=>{
									const rootNode = await GetAsync(()=>GetNodeL2(map.rootNode));
									if (GetChildCount(rootNode) != 0) {
										return void ShowMessageBox({
											title: "Still has children",
											message: "Cannot delete this map until all the children of its root-node have been unlinked or deleted.",
										});
									}

									ShowMessageBox({
										title: `Delete "${map.name}"`, cancelButton: true,
										message: `Delete the map "${map.name}"?`,
										onOK: async()=>{
											await new DeleteMap({mapID: map._key}).Run();
											runInAction("DeleteMap.onDone", ()=>store.main.public.selectedMapID = null);
										},
									});
								}}/>
							</Row>
						</Column>}
				</Column></DropDownContent>
			</DropDown>
		);
	}
}