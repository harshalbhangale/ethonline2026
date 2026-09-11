export type OrganizationRoleValue = "BRAND" | "WORKER" | "OPERATOR";

export type SelfieCheckStatusValue =
  | "NOT_STARTED"
  | "PENDING"
  | "VERIFIED"
  | "FAILED";

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
  worker: {
    displayName: string | null;
    selfieCheckStatus: SelfieCheckStatusValue;
  } | null;
};
