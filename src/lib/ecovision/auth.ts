
import { supabase } from "./supabase";

export interface User {
  email: string;
  demo: boolean;
}

export async function getUser(): Promise<User | null> {
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user?.email) {
    return null;
  }

  return {
    email: data.user.email,
    demo: false,
  };
}

export async function signIn(email: string, password: string): Promise<User> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data.user?.email) {
    throw new Error("Login failed. Please try again.");
  }

  return {
    email: data.user.email,
    demo: false,
  };
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw new Error(error.message);
  }
}
