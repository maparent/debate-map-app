import {AccessLevel, ChangeType, GetNodeChildrenL3, GetParentNodeL3, GetParentPath, ChildGroup, IsMultiPremiseArgument, IsNodeL2, IsNodeL3, IsPremiseOfSinglePremiseArgument, IsRootNode, IsSinglePremiseArgument, Map, MapNode, MapNodeL3, MapNodeType, MeID, Polarity, GetNodeForm, ClaimForm, GetChildLayout_Final, MapNodeType_Info, GetChildGroupLayout, ChildGroupLayout, ShouldChildGroupBoxBeVisible} from "dm_common";
import React from "react";
import {GetPathsToChangedDescendantNodes_WithChangeTypes} from "Store/db_ext/mapNodeEdits.js";
import {GetNodeChildrenL3_Advanced, GetNodeColor} from "Store/db_ext/nodes";
import {GetNodeView} from "Store/main/maps/mapViews/$mapView.js";
import {NodeChildHolder} from "UI/@Shared/Maps/MapNode/NodeUI/NodeChildHolder.js";
import {NodeChildHolderBox} from "UI/@Shared/Maps/MapNode/NodeUI/NodeChildHolderBox.js";
import {logTypes} from "Utils/General/Logging.js";
import {EB_ShowError, EB_StoreError, ES, GetSize, GetSize_Method, MaybeLog, Observer, ShouldLog, WaitXThenRun_Deduped} from "web-vcore";
import {Assert, AssertWarn, CreateStringEnum, E, EA, ea, emptyArray_forLoading, IsNaN, nl, ObjectCE, Vector2, VRect, WaitXThenRun} from "web-vcore/nm/js-vextensions.js";
import {SlicePath} from "web-vcore/nm/mobx-graphlink.js";
import {Column, Row} from "web-vcore/nm/react-vcomponents.js";
import {BaseComponentPlus, GetInnerComp, RenderSource, ShallowEquals, UseCallback, UseEffect, WarnOfTransientObjectProps} from "web-vcore/nm/react-vextensions.js";
import {liveSkin} from "Utils/Styles/SkinManager";
import {FlashComp, FlashElement} from "Utils/UI/FlashKit.js";
import {ChildBoxInfo, ChildConnectorBackground} from "./ChildConnectorBackground.js";
import {ExpandableBox} from "./ExpandableBox.js";
import {NodeChangesMarker} from "./NodeUI/NodeChangesMarker.js";
import {NodeChildCountMarker} from "./NodeUI/NodeChildCountMarker.js";
import {GetMeasurementInfoForNode} from "./NodeUI/NodeMeasurer.js";
import {NodeUI_Inner} from "./NodeUI_Inner.js";
import {NodeUI_Menu_Stub} from "./NodeUI_Menu.js";

// Warn if functions passed to NodeUI are transient (ie. change each render).
// We don't need to do this for every component, but we need at least one component-type in the tree to do so, in order to "stop propagation" of transient props.
// Thus, if the root node rerenders, we prevent the situation of the whole subtree rerendering.
// We choose the NodeUI component as this "barrier" to tree-wide rerendering. (so pay attention if console contains warnings about it!)
@WarnOfTransientObjectProps
@Observer
export class NodeUI extends BaseComponentPlus(
	{} as {
		indexInNodeList: number, map: Map, node: MapNodeL3, path: string, style?,
		leftMarginForLines?: number|n,
		widthOverride?: number|n, // this is set by parent NodeChildHolder, once it determines the width that all children should use
		onHeightOrPosChange?: ()=>void
		ref_innerUI?: (c: NodeUI_Inner|n)=>any,
	},
	{
		//expectedBoxWidth: 0, expectedBoxHeight: 0,
		innerUIAlignPoint: null as number|n, // todo: either greatly clean up the way this field is used/updated, or remove it altogether (probably the former)
		selfHeight: 0, selfHeight_plusRightContent: 0,
		lastChildBoxOffsets: null as {[key: string]: Vector2}|n,
	},
) {
	/* static renderCount = 0;
	static lastRenderTime = -1; */
	static ValidateProps(props) {
		const {node} = props;
		Assert(IsNodeL2(node), "Node supplied to NodeUI is not level-2!");
		Assert(IsNodeL3(node), "Node supplied to NodeUI is not level-3!");
	}
	static ValidateState(state) {
		const {innerUIAlignPoint, selfHeight} = state;
		Assert(!IsNaN(innerUIAlignPoint) && !IsNaN(selfHeight));
	}

	nodeUI: HTMLDivElement|n;
	innerUI: NodeUI_Inner|n;
	rightColumn: Column|n;
	childBoxes: {[key: string]: NodeChildHolderBox|n} = {};
	nodeChildHolder_direct: NodeChildHolder|n;
	componentDidCatch(message, info) { EB_StoreError(this as any, message, info); }
	render() {
		if (this.state["error"]) return EB_ShowError(this.state["error"]);
		const {indexInNodeList, map, node, path, widthOverride, style, onHeightOrPosChange, ref_innerUI, children} = this.props;
		const {innerUIAlignPoint, selfHeight, selfHeight_plusRightContent, lastChildBoxOffsets} = this.state;

		performance.mark("NodeUI_1");

		const GetNodeChildren = (node2: MapNodeL3|n, path2: string|n): MapNodeL3[]=>(node2 && path2 ? GetNodeChildrenL3(node2.id, path2) : ea);
		const GetNodeChildrenToShow = (node2: MapNodeL3|n, path2: string|n): MapNodeL3[]=>(node2 && path2 ? GetNodeChildrenL3_Advanced(node2.id, path2, map.id, true, undefined, true, true) : ea);

		const nodeChildren = GetNodeChildren(node, path);
		const nodeChildrenToShow = GetNodeChildrenToShow(node, path);
		const nodeForm = GetNodeForm(node, path);
		const nodeView = GetNodeView(map.id, path);
		const nodeTypeInfo = MapNodeType_Info.for[node.type];

		//const sinceTime = GetTimeFromWhichToShowChangedNodes(map.id);
		const sinceTime = 0;
		const pathsToChangedDescendantNodes_withChangeTypes = GetPathsToChangedDescendantNodes_WithChangeTypes(map.id, sinceTime, path);
		const addedDescendants = pathsToChangedDescendantNodes_withChangeTypes.filter(a=>a == ChangeType.add).length;
		const editedDescendants = pathsToChangedDescendantNodes_withChangeTypes.filter(a=>a == ChangeType.edit).length;

		const parent = GetParentNodeL3(path);
		const parentPath = GetParentPath(path);
		const parentNodeView = GetNodeView(map.id, parentPath);
		const parentChildren = parent && parentPath ? GetNodeChildrenL3(parent.id, parentPath) : EA<MapNodeL3>();

		const isSinglePremiseArgument = IsSinglePremiseArgument(node);
		const isPremiseOfSinglePremiseArg = IsPremiseOfSinglePremiseArgument(node, parent);
		const isMultiPremiseArgument = IsMultiPremiseArgument(node);
		const hereArg = node.type == MapNodeType.argument ? node : isPremiseOfSinglePremiseArg ? parent : null;
		const hereArgNodePath = hereArg == node ? path : hereArg == parent ? parentPath : null;
		const hereArgChildren = hereArg ? GetNodeChildren(hereArg, hereArgNodePath) : null;
		const hereArgChildrenToShow = hereArg ? GetNodeChildrenToShow(hereArg, hereArgNodePath).filter(a=>a.id != node.id) : null;
		const boxExpanded = nodeView?.expanded ?? false;

		const siblingNodeViews = Object.entries(parentNodeView?.children ?? {}).OrderBy(a=>parentNodeView?.renderedChildrenOrder.indexOf(a[0]));
		const ownIndexInSiblings = siblingNodeViews.findIndex(a=>a[0] == node.id);
		let isFirstExpandedSibling = nodeView.expanded && siblingNodeViews.slice(0, ownIndexInSiblings).every(a=>!a[1].expanded);
		let isLastExpandedSibling = nodeView.expanded && siblingNodeViews.slice(ownIndexInSiblings + 1).every(a=>!a[1].expanded);
		const grandParentNodeView = GetNodeView(map.id, SlicePath(path, 2));
		let ownIndexInVisualSiblings = -2;
		if (isPremiseOfSinglePremiseArg && grandParentNodeView) {
			const visualSiblingNodeViews = Object.entries(grandParentNodeView.children).OrderBy(a=>grandParentNodeView.renderedChildrenOrder.indexOf(a[0]));
			ownIndexInVisualSiblings = visualSiblingNodeViews.findIndex(a=>a[0] == parent!.id);
			if (!visualSiblingNodeViews.slice(0, ownIndexInVisualSiblings).every(a=>!a[1].expanded)) isFirstExpandedSibling = false;
			if (!visualSiblingNodeViews.slice(ownIndexInVisualSiblings + 1).every(a=>!a[1].expanded)) isLastExpandedSibling = false;
		}
		FlashComp(this, {wait: 0, text: `IsFirstExp:${isFirstExpandedSibling} @isLastExp:${isLastExpandedSibling} @t1:${ownIndexInSiblings} @t2:${ownIndexInVisualSiblings}`});

		/*const playingTimeline = GetPlayingTimeline(map.id);
		const playingTimeline_currentStepIndex = GetPlayingTimelineStepIndex(map.id);
		// const playingTimelineShowableNodes = GetPlayingTimelineRevealNodes_All(map.id);
		// const playingTimelineVisibleNodes = GetPlayingTimelineRevealNodes_UpToAppliedStep(map.id, true);
		// if users scrolls to step X and expands this node, keep expanded even if user goes back to a previous step
		const playingTimelineVisibleNodes = GetPlayingTimelineRevealNodes_UpToAppliedStep(map.id);*/

		performance.mark("NodeUI_2");
		if (ShouldLog(a=>a.nodeRenders)) {
			if (logTypes.nodeRenders_for) {
				if (logTypes.nodeRenders_for == node.id) {
					Log(`Updating NodeUI (${RenderSource[this.lastRender_source]}):${node.id}`, "\nPropsChanged:", this.GetPropChanges(), "\nStateChanged:", this.GetStateChanges());
				}
			} else {
				Log(`Updating NodeUI (${RenderSource[this.lastRender_source]}):${node.id}`, "\nPropsChanged:", this.GetPropChanges().map(a=>a.key), "\nStateChanged:", this.GetStateChanges().map(a=>a.key));
			}
		}
		//NodeUI.renderCount++;
		//NodeUI.lastRenderTime = Date.now();

		const proxyNodeUI_ref = UseCallback(c=>this.proxyDisplayedNodeUI = c, []);
		// if single-premise arg, combine arg and premise into one box, by rendering premise box directly (it will add-in this argument's child relevance-arguments)
		if (isSinglePremiseArgument) {
			const premises = nodeChildren.filter(a=>a && a.type == MapNodeType.claim);
			if (premises.length) {
				AssertWarn(premises.length == 1, `Single-premise argument #${node.id} has more than one premise! (${premises.map(a=>a.id).join(",")})`);
				const premise = premises[0];

				// if has child-limit bar, correct its path
				const firstChildComp = this.FlattenedChildren[0] as any;
				if (firstChildComp && firstChildComp.props.path == path) {
					firstChildComp.props.path = `${firstChildComp.props.path}/${premise.id}`;
				}

				return (
					<NodeUI ref={proxyNodeUI_ref} {...this.props} key={premise.id} map={map} node={premise} path={`${path}/${premise.id}`}>
						{children}
					</NodeUI>
				);
			}

			// if there are not-yet-loaded children that *might* be the premise, wait for them to finish loading before showing the "no premise" message
			if (nodeChildren.Any(a=>a == null)) {
				//return <div title={`Loading premise "${node.children.VKeys()[0]}"...`}>...</div>;
				return <div/>;
			}

			// placeholder, so user can add the base-claim
			// const backgroundColor = GetNodeColor(node).desaturate(0.5).alpha(0.8);
			return (
				<Column>
					<Row /* mt={indexInNodeList === 0 ? 0 : 5} */ className="cursorSet"
						style={{
							padding: 5, borderRadius: 5, cursor: "pointer", border: "1px solid rgba(0,0,0,.5)",
							background: /* backgroundColor.css() */ "rgba(0, 0, 0, 0.7)",
							margin: "5px 0", // emulate usual internal NodeUI
							fontSize: 14, // emulate usual internal NodeUI_Inner
						}}
					>
						<span style={{opacity: 0.5}}>(single-premise arg lacks base-claim; right-click to add)</span>
						{/* <NodeUI_Menu_Helper {...{map, node}}/> */}
						<NodeUI_Menu_Stub {...{map, node, path}} childGroup={ChildGroup.generic}/>
					</Row>
				</Column>
			);
		}

		// Assert(!relevanceArguments.Any(a=>a.type == MapNodeType.claim), "Single-premise argument has more than one premise!");
		/*if (playingTimeline && playingTimeline_currentStepIndex < playingTimeline.steps.length - 1) {
			// relevanceArguments = relevanceArguments.filter(child => playingTimelineVisibleNodes.Contains(`${argumentPath}/${child.id}`));
			// if this node (or a descendent) is marked to be revealed by a currently-applied timeline-step, reveal this node
			relevanceArguments = relevanceArguments.filter(child=>playingTimelineVisibleNodes.Any(a=>a.startsWith(`${argumentPath}/${child.id}`)));
		}*/

		const {width} = this.GetMeasurementInfo();

		const ncToShow_generic = nodeChildrenToShow.filter(a=>a.link?.group == ChildGroup.generic);
		const ncToShow_truth = nodeChildrenToShow.filter(a=>a.link?.group == ChildGroup.truth);
		const hereArgChildrenToShow_relevance = hereArgChildrenToShow?.filter(a=>a.link?.group == ChildGroup.relevance) ?? ea as MapNodeL3[];
		const ncToShow_freeform = nodeChildrenToShow.filter(a=>a.link?.group == ChildGroup.freeform);

		const childLayout = GetChildLayout_Final(node.current, map);
		//const childGroupsShowingDirect = [GetChildGroupLayout(ChildGroup.truth, childLayout)...];
		//const directChildrenArePolarized = childGroupsShowingDirect.length == 1 && && node.type == MapNodeType.claim;
		const truthBoxVisible = ShouldChildGroupBoxBeVisible(node, ChildGroup.truth, childLayout, nodeChildrenToShow);
		const relevanceBoxVisible = ShouldChildGroupBoxBeVisible(hereArg, ChildGroup.relevance, childLayout, hereArgChildrenToShow);
		const freeformBoxVisible = ShouldChildGroupBoxBeVisible(node, ChildGroup.freeform, childLayout, nodeChildrenToShow);
		const groupsUsingBoxes = (truthBoxVisible ? 1 : 0) + (relevanceBoxVisible ? 1 : 0) + (freeformBoxVisible ? 1 : 0);
		//const usingDirect = isMultiPremiseArgument || groupsUsingBoxes == 0 || childLayout == "flat";
		/*const nodeCanHaveGenericChildren = [...nodeTypeInfo.childGroup_childTypes.keys()].Any(a=>a == ChildGroup.generic);
		const usingDirect = nodeCanHaveGenericChildren || childLayout == "flat";*/
		//const usingDirect = ncToShow_generic.length > 0 || childLayout == "flat";
		const ncToShow_direct: MapNodeL3[] = [
			...ncToShow_generic,
			...(truthBoxVisible ? [] : ncToShow_truth),
			//...(relevanceBoxVisible ? [] : hereArgChildrenToShow_relevance),
			...(freeformBoxVisible ? [] : ncToShow_freeform),
		];
		const usingDirect = ncToShow_direct.length;

		// hooks must be constant between renders, so always init the shape (comps will just not be added to tree, if shouldn't be visible)
		const nodeChildHolderBox_truth = //truthBoxVisible &&
			<NodeChildHolderBox {...{map, node, path}} group={ChildGroup.truth}
				ref={UseCallback(c=>this.childBoxes["truth"] = c, [])}
				ref_expandableBox={UseCallback(c=>WaitXThenRun_Deduped(this, "UpdateChildBoxOffsets", 0, ()=>this.UpdateChildBoxOffsets()), [])}
				widthOfNode={widthOverride || width} heightOfNode={selfHeight}
				nodeChildren={nodeChildren} nodeChildrenToShow={ncToShow_truth}
				onHeightOrDividePointChange={UseCallback((height, alignPoint)=>{
					if (truthBoxVisible && relevanceBoxVisible) {
						this.SetState({innerUIAlignPoint: height}); // if truth and relevance boxes are both visible, align-point is between them (so just below truth-box's height)
					} else if (truthBoxVisible) {
						this.SetState({innerUIAlignPoint: alignPoint}); // if only truth box is visible, the align-point is the truth box's own divide-point (ie. at same height as the add-pro/add-con buttons)
					}
					this.CheckForChanges();
				}, [relevanceBoxVisible, truthBoxVisible])}/>;
		const nodeChildHolderBox_relevance = //relevanceBoxVisible &&
			<NodeChildHolderBox {...{map}} group={ChildGroup.relevance}
				node={isPremiseOfSinglePremiseArg ? parent! : node} path={isPremiseOfSinglePremiseArg ? parentPath! : path}
				ref={UseCallback(c=>this.childBoxes["relevance"] = c, [])}
				ref_expandableBox={UseCallback(c=>WaitXThenRun_Deduped(this, "UpdateChildBoxOffsets", 0, ()=>this.UpdateChildBoxOffsets()), [])}
				widthOfNode={widthOverride || width} heightOfNode={selfHeight}
				nodeChildren={hereArgChildren ?? ea} nodeChildrenToShow={hereArgChildrenToShow_relevance}
				onHeightOrDividePointChange={UseCallback((height, alignPoint)=>{
					if (relevanceBoxVisible && !truthBoxVisible) {
						this.SetState({innerUIAlignPoint: alignPoint}); // if only relevance box is visible, the divide-point is the relevance box's own divide-point (ie. at same height as the add-pro/add-con buttons)
					}
					this.CheckForChanges();
				}, [relevanceBoxVisible, truthBoxVisible])}/>;
		const nodeChildHolderBox_freeform = //freeformBoxVisible &&
			<NodeChildHolderBox {...{map, node, path}} group={ChildGroup.freeform}
				ref={UseCallback(c=>this.childBoxes["freeform"] = c, [])}
				ref_expandableBox={UseCallback(c=>WaitXThenRun_Deduped(this, "UpdateChildBoxOffsets", 0, ()=>this.UpdateChildBoxOffsets()), [])}
				widthOfNode={widthOverride || width} heightOfNode={selfHeight}
				nodeChildren={nodeChildren} nodeChildrenToShow={ncToShow_freeform}/>;
		let childConnectorBackground: JSX.Element|n;
		const innerUIAlignPoint_safe = innerUIAlignPoint || (selfHeight / 2);
		if (groupsUsingBoxes > 0 /*&& linkSpawnPoint > 0*/ && Object.entries(lastChildBoxOffsets ?? {}).length) {
			//const linkSpawnHeight = /*(limitBarPos == LimitBarPos.above ? 37 : 0) +*/ (dividePoint ?? 0).KeepAtLeast(selfHeight / 2);
			const linkSpawnHeight = innerUIAlignPoint_safe;
			childConnectorBackground = (
				<ChildConnectorBackground node={node} path={path}
					linkSpawnPoint={new Vector2(0, linkSpawnHeight)} straightLines={false}
					shouldUpdate={true}
					childBoxInfos={([
						!!nodeChildHolderBox_truth && {
							offset: lastChildBoxOffsets?.["truth"],
							color: GetNodeColor({type: "claim"} as any, "raw", false),
						},
						!!nodeChildHolderBox_relevance && {
							offset: lastChildBoxOffsets?.["relevance"],
							color: GetNodeColor({type: "claim"} as any, "raw", false),
						},
						/*!!nodeChildHolderBox_neutrality && {
							offset: lastChildBoxOffsets?.["neutrality"],
							color: GetNodeColor({type: "claim"} as any, "raw", false),
						},*/
						!!nodeChildHolderBox_freeform && {
							offset: lastChildBoxOffsets?.["freeform"],
							color: GetNodeColor({type: MapNodeType.category} as any, "raw", false),
						},
					] as ChildBoxInfo[]).filter(a=>a)}/>
			);
		}
		let nodeChildHolder_direct: JSX.Element|n;
		const nodeChildHolder_direct_ref = UseCallback(c=>this.nodeChildHolder_direct = c, []);
		const nodeChildHolder_direct_onHeightOrDividePointChange = UseCallback(alignPoint=>{
			// if multi-premise argument, divide-point is always at the top (just far enough down that the self-ui can center to the point, so self-height / 2)
			if (!isMultiPremiseArgument) {
				this.SetState({innerUIAlignPoint: alignPoint});
			}
			this.CheckForChanges();
		}, [isMultiPremiseArgument]);
		if (usingDirect && boxExpanded) {
			//const showArgumentsControlBar = directChildrenArePolarized && (node.type == MapNodeType.claim || isSinglePremiseArgument) && boxExpanded && nodeChildrenToShow != emptyArray_forLoading;
			nodeChildHolder_direct = <NodeChildHolder {...{map, node, path, separateChildren: false, showArgumentsControlBar: false}}
				ref={nodeChildHolder_direct_ref}
				// type={node.type == MapNodeType.claim && node._id != demoRootNodeID ? ChildGroup.truth : null}
				group={ChildGroup.generic}
				usesGenericExpandedField={true}
				//linkSpawnPoint={isMultiPremiseArgument ? -selfHeight_plusRightContent + (selfHeight / 2) : dividePoint || (selfHeight / 2)}
				linkSpawnPoint={isMultiPremiseArgument ? -(selfHeight_plusRightContent - innerUIAlignPoint_safe) : innerUIAlignPoint_safe}
				belowNodeUI={isMultiPremiseArgument}
				minWidth={isMultiPremiseArgument && widthOverride ? widthOverride - 20 : 0}
				//childrenWidthOverride={isMultiPremiseArgument && widthOverride ? widthOverride - 20 : null}
				/*nodeChildren={nodeChildren}*/ nodeChildrenToShow={ncToShow_direct}
				onHeightOrDividePointChange={nodeChildHolder_direct_onHeightOrDividePointChange}/>;
		}

		performance.mark("NodeUI_3");
		performance.measure("NodeUI_Part1", "NodeUI_1", "NodeUI_2");
		performance.measure("NodeUI_Part2", "NodeUI_2", "NodeUI_3");
		this.Stash({nodeChildrenToShow}); // for debugging

		return (
			<>
			<div ref={UseCallback(c=>{
				this.nodeUI = c;
				//WaitXThenRun_Deduped([this, "checkForChanges"], 0, ()=>this.CheckForChanges());
				/*if (c) {
					requestAnimationFrame(()=>this.CheckForChanges());
					//FlashComp(this, {el: c, text: "NodeUI rendered"});
				}*/
			}, [])} className="NodeUI clickThrough" style={E(
				{position: "relative", display: "flex", alignItems: "flex-start", padding: "5px 0", opacity: widthOverride != 0 ? 1 : 0},
				isFirstExpandedSibling && {marginTop: -(innerUIAlignPoint_safe - (selfHeight / 2) - 5)},
				isLastExpandedSibling && {marginBottom: -((selfHeight_plusRightContent - innerUIAlignPoint_safe) - (selfHeight / 2) - 5)},
				style,
			)}>
				<Column className="innerBoxColumn clickThrough" style={ES(
					{position: "relative"},
					/* useAutoOffset && {display: "flex", height: "100%", flexDirection: "column", justifyContent: "center"},
					!useAutoOffset && {paddingTop: innerBoxOffset}, */
					// {paddingTop: innerBoxOffset},
					{marginTop: boxExpanded ? (innerUIAlignPoint_safe! - (selfHeight / 2)).NaNTo(0).KeepAtLeast(0) : 0},
				)}>
					{/*node.current.accessLevel != AccessLevel.basic &&
					<div style={{position: "absolute", right: "calc(100% + 5px)", top: 0, bottom: 0, display: "flex", fontSize: 10}}>
						<span style={{margin: "auto 0"}}>{AccessLevel[node.current.accessLevel][0].toUpperCase()}</span>
					</div>*/}
					<NodeUI_Inner ref={UseCallback(c=>{
						this.innerUI = GetInnerComp(c);
						if (ref_innerUI) ref_innerUI(c);
					}, [ref_innerUI])} {...{indexInNodeList, map, node, path, width, widthOverride}}/>
					{/* these are for components shown just to the right of the NodeUI_Inner box */}
					{nodeChildrenToShow == emptyArray_forLoading &&
						<div style={{margin: "auto 0 auto 10px"}}>...</div>}
					{IsRootNode(node) && nodeChildrenToShow != emptyArray_forLoading && nodeChildrenToShow.length == 0 && /*playingTimeline == null &&*/
						<div style={{margin: "auto 0 auto 10px", background: liveSkin.OverlayPanelBackgroundColor().css(), padding: 5, borderRadius: 5}}>To add a node, right click on the root node.</div>}
					{!boxExpanded &&
						<NodeChildCountMarker childCount={nodeChildrenToShow.length + (hereArgChildrenToShow?.length ?? 0)}/>}
					{!boxExpanded && (addedDescendants > 0 || editedDescendants > 0) &&
						<NodeChangesMarker {...{addedDescendants, editedDescendants}}/>}
				</Column>
				{boxExpanded &&
				<Column ref={UseCallback(c=>this.rightColumn = c, [])} className="rightColumn clickThrough" style={{position: "relative"}}>
					{childConnectorBackground}
					{!isMultiPremiseArgument && nodeChildHolder_direct}
					{truthBoxVisible && nodeChildHolderBox_truth}
					{relevanceBoxVisible && nodeChildHolderBox_relevance}
					{/*<NodeChildHolderBox {...{map, node, path}} group={ChildGroup.neutrality}
						ref={UseCallback(c=>this.childBoxes["neutrality"] = c, [])}
						ref_expandableBox={UseCallback(c=>WaitXThenRun_Deduped(this, "UpdateChildBoxOffsets", 0, ()=>this.UpdateChildBoxOffsets()), [])}
						widthOfNode={widthOverride || width} heightOfNode={selfHeight}
						nodeChildren={ea} nodeChildrenToShow={ea}/>*/}
					{freeformBoxVisible && nodeChildHolderBox_freeform}
				</Column>}
			</div>
			{isMultiPremiseArgument && nodeChildHolder_direct}
			</>
		);
	}
	proxyDisplayedNodeUI: NodeUI|n;
	get NodeUIForDisplayedNode() {
		return this.proxyDisplayedNodeUI || this;
	}

	// this is needed to handle certain cases (eg. where this node-view's expansion state is set to collapsed) not caught by downstream-events + ref-callback (well, when wrapped in UseCallback(...))
	PostRender() {
		//FlashComp(this, {text: "NodeUI rendered"});
		this.CheckForChanges();
	}

	// don't actually check for changes until re-rendering has stopped for 500ms
	// CheckForChanges = _.debounce(() => {
	lastSelfHeight = 0;
	lastSelfHeight_plusRightContent = 0;
	lastHeight = 0;
	lastInnerUIAlignPoint = 0;
	CheckForChanges = ()=>{
		//FlashComp(this, {text: "NodeUI.CheckForChanges"});

		const {node, onHeightOrPosChange, innerUIAlignPoint} = this.PropsState;
		const isMultiPremiseArgument = IsMultiPremiseArgument.CatchBail(false, node);
		if (this.DOM_HTML == null) return;

		// if (this.lastRender_source == RenderSource.SetState) return;

		const selfHeight = this.SafeGet(a=>a.innerUI!.DOM_HTML.offsetHeight, 0);
		if (selfHeight != this.lastSelfHeight) {
			MaybeLog(a=>a.nodeRenderDetails && (a.nodeRenderDetails_for == null || a.nodeRenderDetails_for == node.id),
				()=>`OnSelfHeightChange NodeUI (${RenderSource[this.lastRender_source]}):${this.props.node.id}${nl}NewSelfHeight:${selfHeight}`);

			// this.UpdateState(true);
			// this.UpdateState();
			// setSelfHeight(selfHeight);
			this.UpdateChildBoxOffsets();
			this.SetState({selfHeight});
			// if (onHeightOrPosChange) onHeightOrPosChange();
		}
		this.lastSelfHeight = selfHeight;

		const selfHeight_plusRightContent = this.DOM_HTML.offsetHeight;
		this.SetState({selfHeight_plusRightContent});

		// see UseSize_Method for difference between offsetHeight and the alternatives
		const height = this.DOM_HTML.offsetHeight
			// if multi-premise-arg, the nodeChildHolder_direct element is not "within" this.DOM_HTML; so add its height manually
			+ (isMultiPremiseArgument && this.nodeChildHolder_direct != null ? this.nodeChildHolder_direct.DOM_HTML.offsetHeight : 0);
		if (height != this.lastHeight) {
			MaybeLog(a=>a.nodeRenderDetails && (a.nodeRenderDetails_for == null || a.nodeRenderDetails_for == node.id),
				()=>`OnHeightChange NodeUI (${RenderSource[this.lastRender_source]}):${this.props.node.id}${nl}NewHeight:${height}`);

			// this.UpdateState(true);
			// this.UpdateState();
			this.UpdateChildBoxOffsets();
			if (onHeightOrPosChange) onHeightOrPosChange();
		}
		this.lastHeight = height;

		if (innerUIAlignPoint != this.lastInnerUIAlignPoint) {
			if (onHeightOrPosChange) onHeightOrPosChange();
		}

		/* else {
			if (this.lastRender_source == RenderSource.SetState) return;
			this.UpdateState();
			this.ReportChildrenCenterYChange();
		} */
	};

	OnChildHeightOrPosChange_updateStateQueued = false;
	OnChildHeightOrPosChange = ()=>{
		//FlashComp(this, {text: "NodeUI.OnChildHeightOrPosChange"});
		// wait one frame, so that if multiple calls to this method occur in the same frame, we only have to call OnHeightOrPosChange() once
		if (this.OnChildHeightOrPosChange_updateStateQueued) return;
		this.OnChildHeightOrPosChange_updateStateQueued = true;
		requestAnimationFrame(()=>{
			this.OnChildHeightOrPosChange_updateStateQueued = false;
			if (!this.mounted) return;
			this.UpdateChildBoxOffsets();
		});
	};
	UpdateChildBoxOffsets(forceUpdate = false) {
		const newState = {} as any;

		if (this.rightColumn) {
			const holderRect = VRect.FromLTWH(this.rightColumn.DOM!.getBoundingClientRect());

			const lastChildBoxOffsets = this.childBoxes.Pairs().ToMapObj(pair=>pair.key, pair=>{
				const childBox = pair.value?.expandableBox?.DOM;
				if (childBox == null) return null; // can be null in certain cases (eg. while inner-ui still data-loading)

				let childBoxOffset = VRect.FromLTWH(childBox.getBoundingClientRect()).Position.Minus(holderRect.Position);
				Assert(childBoxOffset.x < 100, "Something is wrong. X-offset should never be more than 100.");
				childBoxOffset = childBoxOffset.Plus(new Vector2(0, childBox.getBoundingClientRect().height / 2));
				return childBoxOffset;
			});
			newState.lastChildBoxOffsets = lastChildBoxOffsets;
		}

		const cancelIfStateSame = !forceUpdate;
		const changedState = this.SetState(newState, undefined, cancelIfStateSame, true);
		//Log(`Changed state? (${this.props.node.id}): ` + changedState);
	}

	// GetMeasurementInfo(/*props: Props, state: State*/) {
	measurementInfo_cache: MeasurementInfo;
	measurementInfo_cache_lastUsedProps;
	/* ComponentWillReceiveProps(newProps) {
		this.GetMeasurementInfo(newProps, false); // refresh measurement-info when props change
	} */
	// GetMeasurementInfo(useCached: boolean) {
	GetMeasurementInfo(): MeasurementInfo {
		if (this.proxyDisplayedNodeUI) return this.proxyDisplayedNodeUI.GetMeasurementInfo();

		const {props} = this;
		const props_used = this.props.IncludeKeys("map", "node", "path", "leftMarginForLines") as typeof props;
		// Log("Checking whether should remeasure info for: " + props_used.node._id);
		if (this.measurementInfo_cache && ShallowEquals(this.measurementInfo_cache_lastUsedProps, props_used)) return this.measurementInfo_cache;

		const {map, node, path, leftMarginForLines} = props_used;
		//const subnodes = GetSubnodesInEnabledLayersEnhanced(MeID(), map.id, node.id);
		let {expectedBoxWidth, width, expectedHeight} = GetMeasurementInfoForNode.CatchBail({} as ReturnType<typeof GetMeasurementInfoForNode>, node, path, leftMarginForLines);
		if (expectedBoxWidth == null) return {expectedBoxWidth: 100, width: 100}; // till data is loaded, just return this

		const isMultiPremiseArgument = IsMultiPremiseArgument(node);
		if (isMultiPremiseArgument) {
			// expectedBoxWidth = expectedBoxWidth.KeepAtLeast(350);
			width = width.KeepAtLeast(350);
			// expectedBoxWidth += 20;
			//width += 20; // give extra space for left-margin
		}

		this.measurementInfo_cache = {expectedBoxWidth, width/* , expectedHeight */};
		this.measurementInfo_cache_lastUsedProps = props_used;
		return this.measurementInfo_cache;
	}
}
type MeasurementInfo = {expectedBoxWidth: number, width: number};

export enum LimitBarPos {
	above = "above",
	below = "below",
	none = "none",
}