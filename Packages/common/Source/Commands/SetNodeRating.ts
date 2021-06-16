import {AddSchema, AssertValidate, Command, GenerateUUID, Assert, AssertV} from "web-vcore/nm/mobx-graphlink";
import {emptyArray_forLoading} from "web-vcore/nm/js-vextensions";
import {RatingType} from "../Store/db/nodeRatings/@RatingType";
import {Rating} from "../Store/db/nodeRatings/@Rating";
import {GetRatings} from "../Store/db/nodeRatings";

export class SetNodeRating extends Command<{nodeID: string, ratingType: RatingType, value: number}, {}> {
	oldRating: Rating;
	newID: string;
	newRating: Rating;
	Validate() {
		AssertValidate({
			properties: {
				nodeID: {type: "string"},
				ratingType: {$ref: "RatingType"},
				value: {type: ["number", "null"]},
			},
			required: ["nodeID", "ratingType", "value"],
		}, this.payload, "Payload invalid");
		const {nodeID, ratingType, value} = this.payload;

		const oldRatings = GetRatings(nodeID, ratingType, this.userInfo.id);
		AssertV(oldRatings != emptyArray_forLoading, "Old-ratings still loading.");
		Assert(oldRatings.length <= 1, `There should not be more than one rating for this given "slot"!`);
		this.oldRating = oldRatings[0];

		if (value != null) {
			this.newID = GenerateUUID();
			this.newRating = new Rating({
				node: nodeID, type: ratingType, user: this.userInfo.id,
				updated: Date.now(),
				value,
			});
		}
	}

	GetDBUpdates() {
		const updates = {};
		if (this.oldRating) {
			updates[`nodeRatings/${this.oldRating._key}`] = null;
		}
		if (this.newRating) {
			updates[`nodeRatings/${this.newID}`] = this.newRating;
		}
		return updates;
	}
}