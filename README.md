<a href="https://www.llamatutor.com">
  <img alt="Llama Tutor" src="./public/og-image.png">
  <h1 align="center">Dharmic Data Tutor</h1>
</a>

<p align="center">
  A sourced AI tutor with a durable practice-and-feedback loop.
</p>

## Tech stack

- Llama 3.1 70B from Meta for the LLM
- Together AI for LLM inference
- Next.js app router with Tailwind
- Exa.js for the search API
- Netlify Identity for learner accounts
- Netlify Database (Postgres) for goals, practice reps, sessions, and streaks
- Helicone for observability
- Plausible for website analytics

## Local development

1. Install Node.js 22 and enable Corepack.
2. Create Together AI and Exa API keys.
3. Copy `.example.env` to `.env` and add the keys. Helicone is optional.
4. Run `pnpm install --frozen-lockfile`.
5. Run `netlify dev` and open the local URL it prints. This supplies the
   Netlify Identity and Database runtime context.

For a production-shaped local check:

```bash
docker build --tag llamatutor:local .
docker run --rm --env-file .env -p 127.0.0.1:3000:3000 llamatutor:local
```

The health endpoint is <http://localhost:3000/api/health>.

## Deployment

Production and deploy previews run on Netlify. The repository also retains a
production Docker image and a health-checked DigitalOcean fallback. See
[docs/deployment.md](docs/deployment.md) and the
[Option B ADR](docs/adr/0002-option-b-netlify-identity-database.md).

## Future Tasks

- [ ] Add a share & copy buttons that folks can click on after convos are generated
- [ ] Add potential follow up questions + new chat at the end of chat page
- [ ] Split the page into two pages and add back the footer
- [ ] Move all my icons into their own typescript file (transform.tools)
- [ ] Add a more detailed landing page with a nice section with the GitHub link
- [ ] Add nice hamburger menu on mobile
- [ ] Try out the generative UI stuff from Vercel
- [ ] Add a nicer dropdown overall
