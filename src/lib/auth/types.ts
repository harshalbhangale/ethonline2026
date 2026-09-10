export type OrganizationRoleValue = "BRAND" | "WORKER" | "OPERATOR";

export type MeResponse = {
  user: {
    id: string;
    privyUserId: string;
  };
  organization: {
    id: string;
    name: string;
  } | null;
  role: OrganizationRoleValue | null;
};
