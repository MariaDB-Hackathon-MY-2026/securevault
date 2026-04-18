# syntax=docker/dockerfile:1.19
FROM node:22-bookworm-slim

ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

COPY --exclude=.env --exclude=.env.* secure-vault/package.json secure-vault/package-lock.json ./
RUN npm ci

COPY secure-vault ./

RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "start", "--", "--hostname", "0.0.0.0", "--port", "3000"]
