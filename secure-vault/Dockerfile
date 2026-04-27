# syntax=docker/dockerfile:1.19
FROM node:22-bookworm-slim

ENV NEXT_TELEMETRY_DISABLED=1
ENV NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_FETCH_RETRIES=5 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000

WORKDIR /app

COPY --exclude=.env --exclude=.env.* secure-vault/package.json secure-vault/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
RUN apt-get update \
  && apt-get install -y --no-install-recommends poppler-utils \
  && rm -rf /var/lib/apt/lists/*

COPY secure-vault ./

RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start", "--", "--hostname", "0.0.0.0", "--port", "3000"]
