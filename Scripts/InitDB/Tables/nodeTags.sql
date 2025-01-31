CREATE TABLE app_public."nodeTags" (
    id text NOT NULL,
    creator text NOT NULL,
    "createdAt" bigint NOT NULL,
    nodes text[] NOT NULL,
    "mirrorChildrenFromXToY" jsonb,
    "xIsExtendedByY" jsonb,
    "mutuallyExclusiveGroup" jsonb,
    "restrictMirroringOfX" jsonb,
    labels jsonb,
    "cloneHistory" jsonb,
	"c_accessPolicyTargets" text[] NOT NULL
);
ALTER TABLE ONLY app_public."nodeTags" ADD CONSTRAINT "v1_draft_nodeTags_pkey" PRIMARY KEY (id);
ALTER TABLE app_public."nodeTags" DROP CONSTRAINT IF EXISTS "c_accessPolicyTargets_check", ADD CONSTRAINT "c_accessPolicyTargets_check" CHECK (cardinality("c_accessPolicyTargets") > 0);