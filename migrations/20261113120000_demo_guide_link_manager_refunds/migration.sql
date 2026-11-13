-- Demo data only, guarded by the demo Guide login's email: on any other database this migration changes nothing.
-- 1. Operations Manager can refund (a second approver for refunds over the threshold). Only runs where the demo Guide login exists.
UPDATE "Role" SET "canIssueRefunds" = true
WHERE "name" = 'Operations Manager'
  AND EXISTS (SELECT 1 FROM "User" WHERE "email" = 'elena.guide@tour-guide.openship.org');

-- 2. Link the demo Guide login to the guide record "Elena Rossi" (only if neither side is already linked).
UPDATE "Guide" SET "user" = (SELECT "id" FROM "User" WHERE "email" = 'elena.guide@tour-guide.openship.org')
WHERE "id" = (SELECT "id" FROM "Guide" WHERE "name" = 'Elena Rossi' AND "user" IS NULL ORDER BY "createdAt" LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM "Guide" g WHERE g."user" = (SELECT "id" FROM "User" WHERE "email" = 'elena.guide@tour-guide.openship.org'));

-- 3. Give that guide up to 4 accepted departures: the next scheduled departures that have no guide yet (only if she has no accepted one upcoming).
INSERT INTO "GuideAssignment" ("id", "departure", "guide", "role", "status", "payCents", "currencyCode", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, d."id", g."id", 'lead', 'accepted', COALESCE(g."payRateCents", 0), g."currencyCode", now(), now()
FROM "Guide" g
JOIN LATERAL (
  SELECT dep."id" FROM "Departure" dep
  WHERE dep."status" = 'scheduled' AND dep."startAt" > now()
    AND NOT EXISTS (SELECT 1 FROM "GuideAssignment" ga WHERE ga."departure" = dep."id" AND ga."status" IN ('offered','accepted','worked'))
  ORDER BY dep."startAt" LIMIT 4
) d ON true
WHERE g."user" = (SELECT "id" FROM "User" WHERE "email" = 'elena.guide@tour-guide.openship.org')
  AND NOT EXISTS (SELECT 1 FROM "GuideAssignment" ga JOIN "Departure" dd ON dd."id" = ga."departure" WHERE ga."guide" = g."id" AND ga."status" = 'accepted' AND dd."startAt" > now());
