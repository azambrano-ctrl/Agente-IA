FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY agente.js negocio.json ./
COPY src ./src
ENV NODE_ENV=production DATA_DIR=/app/data
VOLUME /app/data
EXPOSE 3000
USER node
CMD ["node", "agente.js"]
