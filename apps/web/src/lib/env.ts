function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Variável de ambiente ausente: ${name}`);
  return value;
}

const devAuth = import.meta.env.DEV && import.meta.env.VITE_DEV_AUTH === "true";

export const env = {
  apiUrl: required("VITE_API_URL", import.meta.env.VITE_API_URL).replace(/\/$/, ""),
  devAuth,
  supabaseUrl: devAuth ? "" : required("VITE_SUPABASE_URL", import.meta.env.VITE_SUPABASE_URL),
  supabaseAnonKey: devAuth ? "" : required("VITE_SUPABASE_ANON_KEY", import.meta.env.VITE_SUPABASE_ANON_KEY),
};
