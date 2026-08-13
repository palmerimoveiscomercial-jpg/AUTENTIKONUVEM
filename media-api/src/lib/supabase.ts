import {createClient} from '@supabase/supabase-js';
import {env} from './env';

// O esquema é criado por migrações SQL e validado na fronteira com Zod.
// Mantemos o cliente sem tipagem gerada para que a implantação inicial não
// dependa de credenciais de produção durante o build.
let client: any;

export function supabaseAdmin(): any {
  if (!client) {
    client = createClient(env().SUPABASE_URL, env().SUPABASE_SERVICE_ROLE_KEY, {
      auth: {persistSession: false, autoRefreshToken: false},
      global: {headers: {'X-Client-Info': 'autentiko-media-api/2.4.0'}}
    });
  }
  return client;
}
