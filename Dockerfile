# Build the client, run the server, serve both from one container — all on Bun.
# Uses the root bun.lock for reproducible installs (--frozen-lockfile).

FROM oven/bun:1-alpine AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY client/package.json client/
COPY server/package.json server/
RUN bun install --frozen-lockfile
COPY tsconfig.base.json ./
COPY client client
RUN bun run --cwd client --bun build

FROM oven/bun:1-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json bun.lock ./
COPY client/package.json client/
COPY server/package.json server/
RUN bun install --frozen-lockfile --production
COPY server server
COPY --from=build /app/client/dist client/dist
EXPOSE 4000
VOLUME /app/server/data
CMD ["bun", "server/src/index.ts"]
