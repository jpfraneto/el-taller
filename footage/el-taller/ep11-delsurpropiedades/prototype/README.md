# Del Sur Propiedades · prototipo

Prototype by [El Taller con JP](https://jpfraneto.com) for Del Sur Propiedades, a real estate agency in Puerto Varas, Chile.
Their listings in photos and on the map of the lake, filters you tap instead of dropdowns, every code in their posts as a
link (`/3257`), and "cuéntanos qué buscas", where an AI picks from their real listings.

- Live: https://delsurpropiedades.jpfraneto.com (first version) · https://delsurpropiedades.jpfraneto.com/nueva/ (second)
- A Cloudflare Worker with static assets (`public/`), KV for the last good read of their site, and a cron every 10 minutes
  that re-reads one category (`src/delsur.js`).
- The listings, photos and texts are the ones Del Sur publishes on [delsurpropiedades.cl](https://www.delsurpropiedades.cl).

```sh
npm install
echo 'OPENROUTER_API_KEY=...' > .dev.vars   # only for the AI search
npm run dev                                  # http://localhost:8811
```

Deploying to your own account: change `routes` and `kv_namespaces` in `wrangler.jsonc`, then
`npx wrangler secret put OPENROUTER_API_KEY` and `npx wrangler deploy`. `taller.json` lists every tie to El Taller.
