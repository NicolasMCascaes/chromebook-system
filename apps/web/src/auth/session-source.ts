import { env } from "../lib/env";
import { getSupabase } from "../lib/supabase";

type TokenListener = (accessToken: string | null) => void;

export interface SessionSource {
  getAccessToken(): Promise<string | null>;
  onChange(listener: TokenListener): () => void;
  signOut(): Promise<void>;
}

const supabaseSource: SessionSource = {
  async getAccessToken() {
    const { data } = await getSupabase().auth.getSession();
    return data.session?.access_token ?? null;
  },
  onChange(listener) {
    const { data } = getSupabase().auth.onAuthStateChange((_event, session) => listener(session?.access_token ?? null));
    return () => data.subscription.unsubscribe();
  },
  async signOut() {
    await getSupabase().auth.signOut();
  },
};

const DEV_TOKEN_KEY = "chromebook.devAccessToken";
const devListeners = new Set<TokenListener>();

function readDevToken(): string | null {
  try {
    return localStorage.getItem(DEV_TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeDevToken(accessToken: string | null): void {
  try {
    if (accessToken) localStorage.setItem(DEV_TOKEN_KEY, accessToken);
    else localStorage.removeItem(DEV_TOKEN_KEY);
  } catch {
    return;
  }
}

export function setDevAccessToken(accessToken: string | null): void {
  writeDevToken(accessToken);
  devListeners.forEach((listener) => listener(accessToken));
}

const devSource: SessionSource = {
  async getAccessToken() {
    return readDevToken();
  },
  onChange(listener) {
    devListeners.add(listener);
    return () => devListeners.delete(listener);
  },
  async signOut() {
    setDevAccessToken(null);
  },
};

export const sessionSource: SessionSource = env.devAuth ? devSource : supabaseSource;
