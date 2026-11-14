import { AsyncLocalStorage } from 'node:async_hooks';

// Transaction-local settings never leak a user's identity to a pooled connection.
export const actors = new AsyncLocalStorage();
export async function setActor(client, actor) {
  if (actor) await client.query("SELECT set_config('infinity.actor_id',$1,true),set_config('infinity.actor_name',$2,true)",[actor.id,actor.name]);
}
export function actorPool(pool) {
  return {
    async query(...args) {
      const actor=actors.getStore();
      if (!actor || /^\s*(SELECT|WITH)\b/i.test(typeof args[0]==='string'?args[0]:'')) return pool.query(...args);
      const client=await pool.connect();
      try { await client.query('BEGIN'); await setActor(client,actor); const result=await client.query(...args); await client.query('COMMIT'); return result; }
      catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
    },
    async connect() {
      const client=await pool.connect(),actor=actors.getStore();
      return {release:()=>client.release(),async query(...args){const result=await client.query(...args);if(args[0]==='BEGIN')await setActor(client,actor);return result;}};
    },
  };
}
