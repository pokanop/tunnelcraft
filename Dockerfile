# Build the client, run the server, serve both from one container
FROM node:22-alpine AS build
WORKDIR /app
COPY client/package*.json client/
RUN npm --prefix client install
COPY client client
RUN npm --prefix client run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY server/package*.json server/
RUN npm --prefix server install --omit=dev
COPY server server
COPY --from=build /app/client/dist client/dist
EXPOSE 4000
VOLUME /app/server/data
CMD ["node", "server/src/index.js"]
