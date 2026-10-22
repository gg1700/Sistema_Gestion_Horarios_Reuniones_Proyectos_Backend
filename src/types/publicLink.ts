export type PublicLinkUserId = string | number;

export interface PublicLinkAccount {
  userId: PublicLinkUserId;
  handleName: string;
  publicLinkActive: boolean;
}

export type PublicLinkChanges = Partial<Pick<PublicLinkAccount, "handleName" | "publicLinkActive">>;

export interface PublicLinkRepository {
  findByUserId(userId: PublicLinkUserId): Promise<PublicLinkAccount | null>;

  findByHandle(handleName: string): Promise<PublicLinkAccount | null>;

  updateByUserId(
    userId: PublicLinkUserId,
    changes: PublicLinkChanges
  ): Promise<PublicLinkAccount | null>;
}

export interface PublicLinkDetails {
  handleName: string;
  url: string;
  publicLinkActive: boolean;
}

export interface HandleAvailabilityResult {
  handleName: string;
  available: boolean;
}
