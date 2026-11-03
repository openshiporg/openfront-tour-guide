export const permissionNames = [
  'canSeeOtherPeople', 'canEditOtherPeople', 'canManagePeople', 'canManageRoles', 'canAccessDashboard',
  'canManageOnboarding', 'canManagePayments', 'canReadPayments', 'canIssueRefunds', 'canReadAudit',
  'canManageTours', 'canManageDepartures', 'canManageBookings', 'canManageGuides', 'canManageResources',
  'canManageChannels', 'canCheckIn', 'canReadMedicalNotes', 'canManagePromos', 'canManageWaivers', 'canManageSettings', 'canManageCustomers',
] as const;
export type Permission = typeof permissionNames[number];
export type Session = { itemId: string; listKey: string; data: { name: string; email?: string; role: { id: string; name: string } & Record<Permission, boolean> } };
type AccessArgs = { session?: Session };
export const isSignedIn = ({ session }: AccessArgs) => Boolean(session?.itemId);
export const permissions = Object.fromEntries(permissionNames.map(key => [key, ({ session }: AccessArgs) => session?.data.role?.[key] === true])) as Record<Permission, (args: AccessArgs) => boolean>;
export const rules = {
  canReadPeople: ({ session }: AccessArgs) => !session ? false : session.data.role?.canSeeOtherPeople ? true : { id: { equals: session.itemId } },
  canUpdatePeople: ({ session }: AccessArgs) => !session ? false : session.data.role?.canEditOtherPeople ? true : { id: { equals: session.itemId } },
};
