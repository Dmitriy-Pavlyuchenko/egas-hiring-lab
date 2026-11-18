FROM node:24-bookworm-slim
WORKDIR /app
COPY --chown=node:node . .
RUN mkdir runtime && chown node:node runtime
USER node
ENV HOST=0.0.0.0 PORT=3080
EXPOSE 3080
CMD ["npm","start"]
