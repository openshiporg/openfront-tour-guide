import { isSignedIn } from "../access";

// Profile writes go through normal access and hooks; only these fields are accepted.
export default async function updateActiveUser(_root: unknown, { data }: { data: any }, context: any) {
  if (!isSignedIn({ session: context.session })) throw new Error("Not authenticated");
  const allowed = new Set(["name", "onboardingStatus"]);
  if (Object.keys(data || {}).some((key) => !allowed.has(key))) throw new Error("Unsupported profile field");
  if (data.onboardingStatus && !["not_started", "in_progress", "completed", "dismissed"].includes(data.onboardingStatus)) throw new Error("Invalid onboarding status");
  return context.db.User.updateOne({ where: { id: context.session.itemId }, data });
}
