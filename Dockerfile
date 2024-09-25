# Alpine Linux image
FROM node:16-alpine

# Main file
WORKDIR /serverDb

# Copy and download dependencies
COPY package.json package-lock.json ./
RUN yarn --frozen-lockfile
RUN npm install

#COPY . .

# Port to run
# EXPOSE 3003


# # Run
# CMD ["npm", "start"]