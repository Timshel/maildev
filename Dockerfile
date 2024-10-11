# Base
FROM node:18-alpine AS base

ENV NODE_ENV=production
ENV MAILDEV_WEB_PORT=1080
ENV MAILDEV_SMTP_PORT=1025
ENV MAILDEV_MAIL_DIRECTORY=/tmp/maildev

# Build
FROM base AS build
WORKDIR /root
COPY . .
RUN npm install typescript -g \
  && npm install sass -g \
  && npm install \
  && npm prune \
  && npm cache clean --force \
  && npm run build

# Prod
FROM base AS prod

RUN mkdir -p /tmp/maildev && chown node:node /tmp/maildev

USER node
WORKDIR /home/node

COPY --chown=node:node . .
COPY --chown=node:node --from=build /root/node_modules ./node_modules
COPY --chown=node:node --from=build /root/dist ./dist

EXPOSE $MAILDEV_WEB_PORT $MAILDEV_SMTP_PORT

ENTRYPOINT ["bin/maildev"]
HEALTHCHECK --interval=10s --timeout=1s \
  CMD wget -O - http://localhost:${MAILDEV_WEB_PORT}${MAILDEV_BASE_PATHNAME}/healthz || exit 1
