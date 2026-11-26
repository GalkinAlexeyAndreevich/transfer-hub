export type Avatar = {
  id: number;
  avatarKey: string;
  uploadedAt: string;
};

export type PublicUser = {
  id: number;
  login: string;
  age: number;
  description: string | null;
  avatars: Avatar[];
};

export type UserProfile = PublicUser & { email: string };
