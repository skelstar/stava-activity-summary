FROM node:20-alpine
WORKDIR /app

RUN npm install -g yarn

COPY package.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/

RUN yarn install

COPY . .

RUN yarn workspace strava-summary-client build

ENV NODE_ENV=production
EXPOSE 3000

CMD ["yarn", "workspace", "strava-summary-server", "start"]
