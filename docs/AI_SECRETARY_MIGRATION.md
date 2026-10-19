# AI Secretary Virtual Office → Howard AI Studio

Status: STAGING PR — DO NOT MERGE UNTIL CLOUDFLARE ACCESS IS CONFIGURED AND TESTED.

## Scope
- `https://howardaistudio.com/`: personal AI tool dashboard.
- `https://howardaistudio.com/office/`: pixel secretary office (demo and manual handoffs; NOT automated AI providers).
- Original redirects in `_redirects` remain untouched, including `/app`, `/login`, `/signup`, `/dashboard`, `/365droid`, `/defendline`.
- `https://hvasec.com/` remains the separate public sales site.

## Required gate BEFORE MERGE
1. In **Cloudflare Zero Trust → Access → Applications**, create a **Self-hosted** app for `howardaistudio.com` (protect entire apex host including `/` and `/office/*`). Allow only the owner's verified identity; deny other accounts.
2. In an incognito browser without login, check that `https://howardaistudio.com/` and `https://howardaistudio.com/office/` are challenged or denied. Sign in with authorized identity and check both work.
3. Confirm `howardaistudio.com` routes to the existing Cloudflare project `howardaistudio-website`. DNS alone cannot create `/office/`.
4. Confirm `_headers` is honored by the deployed Worker/static-asset path and Office CSP is not blocked.
5. Confirm JS/CSS load and the four demo meeting modes run in a real browser.
6. Verify the three external subdomains and all existing `_redirects` still work.

## Windows Agent
Agent **source package requires independent Windows rebuilding and installation testing**. Update `backend_bridge/security.py` to use:
```python
REMOTE_ORIGINS = frozenset({"https://howardaistudio.com"})
```
Do NOT publish Windows debug Chrome profiles, meeting transcripts, pairing secrets, or cookies in this public repository. HTTPS origin→loopback Local Network Access depends on browser permissions and must be tested rather than bypassed.

## Privacy & limitations
Meeting logs in IndexedDB are isolated per origin. Export old history from hvasec.com if needed before removing the old Office.
Robots/noindex is not authentication; Cloudflare Access is the privacy boundary.
The Office Web UI contains no browser automation for third-party AI websites. The example meeting results are synthetic.
