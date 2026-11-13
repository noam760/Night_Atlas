import { defineConfig } from 'vite'

const [owner, repository] = (process.env.GITHUB_REPOSITORY ?? '').split('/')
const isUserSite = repository?.toLowerCase() === `${owner.toLowerCase()}.github.io`

export default defineConfig({
  base: repository && !isUserSite ? `/${repository}/` : '/',
  server: {
    allowedHosts: ['.loca.lt'],
  },
})