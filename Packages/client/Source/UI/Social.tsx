import {ScrollView} from "web-vcore/nm/react-vscrollview";
import {BaseComponent} from "web-vcore/nm/react-vextensions";
import {VReactMarkdown_Remarkable, PageContainer} from "web-vcore";
import {styles, ES} from "../Utils/UI/GlobalStyles";

const pageText = `
The Social page is under development.

In the meantime, here are links to our social media and development pages:
`;

export class SocialUI extends BaseComponent<{}, {}> {
	render() {
		return (
			<PageContainer scrollable={true}>
				<article className="selectableAC">
					{/* <VReactMarkdown className="selectable" source={pageText}/> */}
					<VReactMarkdown_Remarkable source={pageText}/>
				</article>
			</PageContainer>
		);
	}
}