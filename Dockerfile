FROM node:20-alpine3.18

RUN apk add dos2unix

# Create app directory
WORKDIR /opt/opcuacommander

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
# Bundle app source
COPY . .
COPY package*.json ./
RUN dos2unix bin/opcua-commander.js 

# If you are building your code for production
# The set registry can help in situations behind a firewall with scrict security settings and own CA Certificates.
RUN npm config set registry http://registry.npmjs.org/ && npm install -g typescript  && npm ci --mit=dev --unsafe-perm=true --allow-root && npm run build

ENTRYPOINT [ "./bin/opcua-commander.js" ]
# to build
#    docker build . -t commander
# to run 
#    docker run -it commander  -e opc.tcp://localhost:26543
