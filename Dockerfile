# One image serves the API and the web app. Build: docker build --build-arg RELEASE=$(git rev-parse --short HEAD) -t grasp .

ARG NODE_IMAGE=node:24-slim

FROM ${NODE_IMAGE} AS build
WORKDIR /repo
ENV CI=true
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/app/package.json apps/app/
COPY libs/engine/package.json libs/engine/
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM ${NODE_IMAGE} AS runtime
WORKDIR /srv
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/app/package.json apps/app/
COPY libs/engine/package.json libs/engine/
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --ignore-scripts --no-audit --no-fund -w @grasp/api -w @grasp/engine
COPY --from=build /repo/libs/engine/dist libs/engine/dist
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY apps/api/drizzle apps/api/drizzle
COPY --from=build /repo/apps/app/dist/app/browser web

ARG RELEASE=""
ENV RELEASE=${RELEASE} \
    WEB_DIST_DIR=/srv/web \
    PORT=3000
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + process.env.PORT + '/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "apps/api/dist/main.js"]
