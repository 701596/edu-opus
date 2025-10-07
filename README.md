# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/079c49ca-8711-4c19-9196-9c9e002f909d

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/079c49ca-8711-4c19-9196-9c9e002f909d) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/079c49ca-8711-4c19-9196-9c9e002f909d) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)

## Environment variables (local & CI)

This project expects a few VITE_* environment variables for client-side configuration (these are exposed to the browser by Vite). Do NOT commit a `.env` file with real keys.

- Create a local `.env` for development (it is in `.gitignore`) and set the values from your Supabase project. Example values are available in `env.example`.

Example `.env` (local):

```properties
VITE_SUPABASE_PROJECT_ID=your_project_id
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your_publishable_key
```

CI / Hosting (Vercel, Netlify, etc.):

- Add the same variables to your host or CI's secrets/settings (Vercel/Netlify/Cloud providers). Use the provider's dashboard to set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` so builds can reference them.

Security note: If a key was accidentally committed, rotate the key in Supabase immediately and replace it in CI and local environments.

