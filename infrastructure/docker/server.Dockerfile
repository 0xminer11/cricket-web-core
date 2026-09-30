FROM node:24.21.0-bookworm-slim AS build
RUN npm install --global pnpm@10.34.6
WORKDIR /workspace
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
RUN pnpm fetch --frozen-lockfile
COPY . .
RUN pnpm install --offline --frozen-lockfile
ARG SERVICE=api
RUN pnpm exec turbo run build --filter=@the-cricketer/${SERVICE}...
RUN pnpm --filter @the-cricketer/${SERVICE} deploy --prod /output

FROM node:24.21.0-bookworm-slim AS runtime
ARG SERVICE=api
ENV NODE_ENV=production APP_ENV=production SERVICE=${SERVICE}
WORKDIR /app
COPY --from=build --chown=node:node /output ./
USER node
EXPOSE 4300 4310
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+(process.env.SERVICE==='game-server'?(process.env.GAME_SERVER_PORT||4310):(process.env.API_PORT||4300))+'/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
