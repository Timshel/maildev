# Base
FROM node:18-alpine as base
ENV NODE_ENV production

# Build
FROM base as build
WORKDIR /root
COPY . .
RUN npm install typescript -g \
  && npm install sass -g \
  && npm install \
  && npm prune \
  && npm cache clean --force \
  && npm run build

# Prod
FROM base as prod
USER node
WORKDIR /home/node

COPY --chown=node:node . /home/node
COPY --chown=node:node --from=build /root/node_modules /home/node/node_modules
COPY --chown=node:node --from=build /root/dist ./dist
COPY --chown=node:node bin ./bin

EXPOSE 1080 1025
ENV MAILDEV_WEB_PORT 1080
ENV MAILDEV_SMTP_PORT 1025
ENTRYPOINT ["bin/maildev"]
HEALTHCHECK --interval=10s --timeout=1s \
  CMD wget -O - http://localhost:${MAILDEV_WEB_PORT}${MAILDEV_BASE_PATHNAME}/healthz || exit 1
