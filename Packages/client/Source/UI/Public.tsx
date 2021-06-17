import {BaseComponentPlus} from "web-vcore/nm/react-vextensions";
import {MapType} from "dm_common";
import {MapListUI} from "./@Shared/Maps/MapListUI";

export class PublicUI extends BaseComponentPlus({} as {}, {}) {
	render() {
		return <MapListUI type={MapType.Public}/>;
	}
}