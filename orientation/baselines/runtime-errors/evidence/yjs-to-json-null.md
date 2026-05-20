# Scenario 2: yjsToJson silent NULL persist

**Captured:** 2026-05-20T20:49:22.367Z
**Doc:** `cff281b3-cbfc-469e-8146-4474af59f131` (created during the run; safe to delete)
**Defect injection detected in source:** ✅ yes
**Marker phrase typed:** `DEFECT-MARKER-YJS-NULL trigger persist with this body.`

## Probes

| Probe | Expected if audit claim is right (with injection) | Observed |
|---|---|---|
| `content IS NULL` after marker-triggered persist | t (silent NULL) | **t** |
| `octet_length(yjs_state)` | > 0 (Yjs survives) | **96** bytes |
| `content::text` snippet | (NULL) | `` |

## Verdict
⚠️ **AUDIT CLAIM CONFIRMED LIVE.** With the defect branch in place, the persist path wrote SQL NULL to `documents.content` (content_is_null=t) while `yjs_state` survived at 96 bytes. API readers that consult `content` (not `yjs_state`) will see an empty document. The collaboration-server outer try/catch caught nothing — the JSON.stringify of undefined didn't throw, it just produced undefined → pg NULL. **Severity: High — silent data loss.**

## Reproduction protocol (for the human running this)

1. Apply this diff to `api/src/utils/yjsConverter.ts`:
   ```ts
   export function yjsToJson(fragment: Y.XmlFragment): any {
     // TEMPORARY DEFECT INJECTION — revert after capture
     for (let i = 0; i < fragment.length; i++) {
       const item = fragment.get(i);
       if (item instanceof Y.XmlElement) {
         const text = item.toString();
         if (text.includes('DEFECT-MARKER-YJS-NULL')) return undefined;
       }
     }
     // ... rest of original function unchanged
   ```
2. Wait for the dev API to reload (tsx --watch picks up the change in ~1 s).
3. Re-run: `WEB=http://localhost:5173 node orientation/baselines/runtime-errors/scenarios.mjs only=2`
4. `git restore api/src/utils/yjsConverter.ts` to revert.

## Console (errors/warnings only)
  [error] Failed to load resource: the server responded with a status of 401 (Unauthorized)
