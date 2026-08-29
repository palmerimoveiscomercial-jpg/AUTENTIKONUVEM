declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

declare module 'npm:@supabase/supabase-js@2.110.8' {
  export function createClient(url: string, key: string, options?: Record<string, unknown>): any;
}

declare module 'npm:@noble/hashes@2.3.0/sha2.js' {
  export const sha256: {
    create(): { update(bytes: Uint8Array): void; digest(): Uint8Array };
  };
}
