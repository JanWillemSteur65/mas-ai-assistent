FROM registry.access.redhat.com/ubi9/nodejs-20 AS build
WORKDIR /opt/app-root/src

# Ensure all build tooling can write caches/temp files in OpenShift restricted environments
ENV HOME=/tmp
ENV npm_config_cache=/tmp/.npm
ENV XDG_CACHE_HOME=/tmp/.cache

# Copy manifests first (better layer caching) and keep ownership writable for uid 1001 (default in UBI Node.js)
COPY --chown=1001:0 package.json package-lock.json* ./
COPY --chown=1001:0 ui/package.json ui/package-lock.json* ui/
COPY --chown=1001:0 server/package.json server/package-lock.json* server/

RUN npm install

# Copy the rest of the source as the non-root user
COPY --chown=1001:0 . .

# Vite writes a timestamped bundled config next to vite.config.ts; ensure the workspace is writable
USER 0
RUN chown -R 1001:0 /opt/app-root/src && chmod -R g+rwX /opt/app-root/src
USER 1001

RUN npm run build

FROM registry.access.redhat.com/ubi9/nodejs-20 AS run
WORKDIR /opt/app-root/src
ENV NODE_ENV=production
ENV PORT=3000
ENV HOME=/tmp

# Runtime artifacts only
COPY --from=build /opt/app-root/src/server/dist ./server/dist
COPY --from=build /opt/app-root/src/server/public ./server/public
COPY --from=build /opt/app-root/src/server/package.json ./server/package.json
COPY --from=build /opt/app-root/src/node_modules ./node_modules

EXPOSE 3000
CMD ["node","server/dist/index.js"]
