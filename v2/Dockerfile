FROM node:24-alpine
WORKDIR /app
COPY . .
RUN mkdir -p /data && addgroup -S psy && adduser -S psy -G psy && chown -R psy:psy /app /data
USER psy
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4180 DATABASE_PATH=/data/booking.sqlite
EXPOSE 4180
CMD ["node", "--env-file-if-exists=.env", "server.mjs"]
