# Alibaba account smoke test

Historical deployment proof: the public domain now serves the dubbing player
described in the root README. This file and `worker.mjs` retain the initial
account check for reference; they are not the current deployed application.

One ESA edge function serves a small page and `GET /api/health`. The backend
returns its platform and current server time; the page's **Check backend** button
measures the round trip. There are no database or recording dependencies.

Run the backend check locally:

```sh
node --test prototype/worker.test.mjs
```

## Deployment

- ESA routine: `parrotbook-prototype`
- Code version: `1793173312655798735`
- Source: `worker.mjs`, uploaded directly as the routine's JavaScript code
- Environments: staging and production of this separate prototype routine
- Public domains: <https://parrotbook.com/> and <https://www.parrotbook.com/>
- Default preview: <https://parrotbook-prototype-1263482499936169.debug.er.aliyun-esa.net/>

ESA requires authorization for its default debug domain. In the ESA console,
open **Functions and Pages**, choose **Visit** for `parrotbook-prototype`, and
select **Continue visiting**. That generates a preview token valid for 60
minutes. An unsigned request returns `401 Authorization Required` before
reaching this application. A colleague needs a valid preview access link too;
the bare URL alone is insufficient in a fresh browser session.

Deployment, local route checks, and the authenticated live browser check passed
on 2026-10-28. The page's button returned **Backend connected** with an Alibaba
server timestamp and a 219 ms round trip in one browser sample. This establishes
that this account can deploy and run the page plus edge backend; it does not
measure sustained performance or validate future storage/recording features.

The public domains use an ESA free website plan with coverage outside mainland
China. They do not require the debug domain's preview token. Cloudflare remains
the registrar and authoritative DNS provider, with DNS-only CNAME records to
Alibaba. The console reported no ICP filing for this domain, so mainland/global
ESA coverage could not be selected. No paid website plan was purchased.

The earlier applications and data were parked at the owner's request. See the
[infrastructure record](../docs/infrastructure.md) before restoring them.
