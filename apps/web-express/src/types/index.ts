import { Request } from "express";

export interface AppUser {
  id: string;
  email: string;
  display_name?: string;
  full_name?: string;
  avatar_url?: string;
  role?: "admin" | "moderator" | "student" | "staff" | "user";
}

declare module "express-session" {
  interface SessionData {
    user: AppUser | null;
    accessToken?: string;
    refreshToken?: string;
  }
}

export interface Submission {
  id: string;
  title: string;
  description: string;
  category?: string;
  categories?: { name: string };
  category_id?: string;
  status: string;
  vote_count: number;
  comment_count?: number;
  tracking_code?: string;
  anonymous_tracking_hash?: string;
  created_at: string;
  updated_at: string;
  user_id?: string;
  is_anonymous?: boolean;
  staff_note?: string;
  image_url?: string;
  author?: {
    id: string;
    display_name?: string;
    full_name?: string;
    role?: string;
  };
}

export interface Comment {
  id: string;
  submission_id: string;
  body: string;
  content?: string;
  created_at: string;
  user_id?: string;
  is_anonymous?: boolean;
  is_staff?: boolean;
  author?: {
    id: string;
    display_name?: string;
    full_name?: string;
    role?: string;
  };
}

export interface Profile {
  id: string;
  display_name?: string;
  full_name?: string;
  role?: string;
  email?: string;
  created_at?: string;
}
